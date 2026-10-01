"""
Task Manager router — Todoist-style to-do lists for students.

All endpoints require a valid JWT (via get_current_user).

Routes:
    GET    /todos/data                 — full project/section/task tree
    POST   /todos/projects             — create project
    POST   /todos/sections             — create section inside a project
    POST   /todos/tasks                — create task (project/section can be int ID or str name)
    PUT    /todos/tasks/{task_id}      — partial update of a task
    DELETE /todos/tasks/{task_id}      — delete a task

New in this version:
    • Task.schedule_date  — date+time when the student *plans* to work on the task
      (distinct from due_date which is the hard deadline).
    • TaskCreate.project_id / section_id now accept:
        – int  → existing entity ID (ownership is verified)
        – str  → name of a new Project / Section to create on the fly
        – None → no project (inbox) / no section
"""

from datetime import datetime
from typing import List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user
from database import get_db, User, Project, Section, Task
from models import (
    ProjectCreate, ProjectResponse,
    SectionCreate, SectionResponse,
    TaskCreate, TaskResponse, TaskUpdate,
    ProjectWithDataResponse, SectionWithTasksResponse,
    TodosDataResponse,
)

router = APIRouter(prefix="/todos", tags=["todos"])


# ── Low-level DB helpers ───────────────────────────────────────────────────────

def _get_project_or_404(project_id: int, user_id: int, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == user_id,
    ).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Проект не найден",
        )
    return project


def _get_task_or_404(task_id: int, user_id: int, db: Session) -> Task:
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_id == user_id,
    ).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задача не найдена",
        )
    return task


# ── Smart project / section resolution ────────────────────────────────────────

def _resolve_project(
    project_ref: Optional[Union[int, str]],
    user_id: int,
    db: Session,
    default_color: str = "#6366f1",
) -> Optional[int]:
    """
    Resolve *project_ref* to a concrete project_id integer.

    • None → None  (task goes to global inbox)
    • int  → verify ownership, return the same ID
    • str  → create a new Project with that name, flush to get its ID, return it.
             The caller must db.commit() later — flush keeps everything in one transaction.
    """
    if project_ref is None:
        return None

    if isinstance(project_ref, int):
        _get_project_or_404(project_ref, user_id, db)
        return project_ref

    # ── str: create a new project on the fly ──────────────────────────────────
    name = project_ref.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Название проекта не должно быть пустым",
        )
    project = Project(user_id=user_id, name=name, color=default_color)
    db.add(project)
    db.flush()  # populates project.id inside the current transaction
    return project.id


def _resolve_section(
    section_ref: Optional[Union[int, str]],
    resolved_project_id: Optional[int],
    user_id: int,
    db: Session,
) -> Optional[int]:
    """
    Resolve *section_ref* to a concrete section_id integer.

    • None → None (no section)
    • int  → verify the section belongs to one of this user's projects, return ID
    • str  → create a new Section inside *resolved_project_id* (must not be None),
             flush to get its ID, return it.
    """
    if section_ref is None:
        return None

    if isinstance(section_ref, int):
        section = db.query(Section).filter(Section.id == section_ref).first()
        if not section:
            raise HTTPException(status_code=404, detail="Раздел не найден")
        # Verify the section belongs to the current user via its project
        _get_project_or_404(section.project_id, user_id, db)
        return section_ref

    # ── str: create a new section on the fly ──────────────────────────────────
    if resolved_project_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя создать раздел без проекта — укажите project_id",
        )
    name = section_ref.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Название раздела не должно быть пустым",
        )
    # Place the new section after all existing ones in this project
    existing_count = (
        db.query(Section)
        .filter(Section.project_id == resolved_project_id)
        .count()
    )
    section = Section(
        project_id=resolved_project_id,
        name=name,
        position=existing_count,
    )
    db.add(section)
    db.flush()  # populates section.id inside the current transaction
    return section.id


# ── Response serialiser ────────────────────────────────────────────────────────

def _task_to_response(task: Task) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        user_id=task.user_id,
        project_id=task.project_id,
        section_id=task.section_id,
        title=task.title,
        description=task.description or "",
        due_date=task.due_date,
        schedule_date=getattr(task, "schedule_date", None),  # safe for old DB rows
        priority=task.priority,
        is_completed=task.is_completed,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


# ── GET /todos/data ────────────────────────────────────────────────────────────

@router.get("/data", response_model=TodosDataResponse)
def get_todos_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return the complete task-manager tree for the authenticated user in one query:
      projects → sections → tasks (within section)
               → inbox_tasks (tasks in project but without a section)
      inbox_tasks — tasks with no project at all.

    Every task object includes both due_date and schedule_date.
    """
    projects = (
        db.query(Project)
        .filter(Project.user_id == current_user.id)
        .options(
            joinedload(Project.sections).joinedload(Section.tasks),
            joinedload(Project.tasks),
        )
        .order_by(Project.created_at)
        .all()
    )

    # Tasks with no project (true global inbox)
    inbox_tasks = (
        db.query(Task)
        .filter(
            Task.user_id == current_user.id,
            Task.project_id.is_(None),
            Task.is_completed == False,
        )
        .order_by(Task.created_at)
        .all()
    )

    project_nodes: List[ProjectWithDataResponse] = []
    for project in projects:
        section_nodes: List[SectionWithTasksResponse] = []

        for section in sorted(project.sections, key=lambda s: s.position):
            active_section_tasks = [
                _task_to_response(t)
                for t in sorted(section.tasks, key=lambda t: t.created_at)
                if not t.is_completed
            ]
            section_nodes.append(
                SectionWithTasksResponse(
                    id=section.id,
                    project_id=section.project_id,
                    name=section.name,
                    position=section.position,
                    tasks=active_section_tasks,
                )
            )

        # Tasks that belong to the project but have no section
        project_inbox = [
            _task_to_response(t)
            for t in sorted(project.tasks, key=lambda t: t.created_at)
            if t.section_id is None and not t.is_completed
        ]

        project_nodes.append(
            ProjectWithDataResponse(
                id=project.id,
                user_id=project.user_id,
                name=project.name,
                color=project.color,
                created_at=project.created_at,
                sections=section_nodes,
                inbox_tasks=project_inbox,
            )
        )

    return TodosDataResponse(
        projects=project_nodes,
        inbox_tasks=[_task_to_response(t) for t in inbox_tasks],
    )


# ── POST /todos/projects ───────────────────────────────────────────────────────

@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new project for the authenticated user."""
    project = Project(
        user_id=current_user.id,
        name=payload.name.strip(),
        color=payload.color,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


# ── POST /todos/sections ───────────────────────────────────────────────────────

@router.post("/sections", response_model=SectionResponse, status_code=status.HTTP_201_CREATED)
def create_section(
    payload: SectionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a section inside a project that belongs to the current user.
    The project must exist and be owned by the caller.
    """
    _get_project_or_404(payload.project_id, current_user.id, db)

    section = Section(
        project_id=payload.project_id,
        name=payload.name.strip(),
        position=payload.position,
    )
    db.add(section)
    db.commit()
    db.refresh(section)
    return section


# ── POST /todos/tasks ──────────────────────────────────────────────────────────

@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new task. Supports on-the-fly creation of projects and sections:

    project_id:
      • int  → must exist and belong to current user
      • str  → a new Project is created with this name (default color #6366f1)
      • None → task lands in the global inbox

    section_id:
      • int  → must exist and belong to one of the user's projects
      • str  → a new Section is created inside the resolved project
               (project_id must not be None when section is a string)
      • None → task has no section within its project

    due_date      — hard deadline (крайний срок сдачи).
    schedule_date — planned work date (когда студент планирует выполнять задачу).

    All entities (project, section, task) are persisted atomically in one transaction.
    """
    try:
        resolved_project_id = _resolve_project(
            payload.project_id, current_user.id, db
        )
        resolved_section_id = _resolve_section(
            payload.section_id, resolved_project_id, current_user.id, db
        )

        now = datetime.utcnow()
        task = Task(
            user_id=current_user.id,
            project_id=resolved_project_id,
            section_id=resolved_section_id,
            title=payload.title.strip(),
            description=payload.description or "",
            due_date=payload.due_date,
            schedule_date=payload.schedule_date,
            priority=payload.priority,
            is_completed=False,
            created_at=now,
            updated_at=now,
        )
        db.add(task)
        db.commit()
        db.refresh(task)

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось создать задачу",
        ) from exc

    return _task_to_response(task)


# ── PUT /todos/tasks/{task_id} ─────────────────────────────────────────────────

@router.put("/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Partially update a task owned by the current user.
    Only the fields explicitly provided in the request body are changed.

    To reschedule a task, pass schedule_date with a new datetime.
    To extend the deadline, pass due_date with a new datetime.
    """
    task = _get_task_or_404(task_id, current_user.id, db)

    if payload.title is not None:
        task.title = payload.title.strip()
    if payload.description is not None:
        task.description = payload.description
    if payload.due_date is not None:
        task.due_date = payload.due_date
    if payload.schedule_date is not None:
        task.schedule_date = payload.schedule_date
    if payload.priority is not None:
        task.priority = payload.priority
    if payload.is_completed is not None:
        task.is_completed = payload.is_completed

    # Moving task between projects / sections
    if payload.project_id is not None:
        _get_project_or_404(payload.project_id, current_user.id, db)
        task.project_id = payload.project_id
    if payload.section_id is not None:
        section = db.query(Section).filter(Section.id == payload.section_id).first()
        if not section:
            raise HTTPException(status_code=404, detail="Раздел не найден")
        _get_project_or_404(section.project_id, current_user.id, db)
        task.section_id = payload.section_id
        # Auto-assign the section's project if task has none
        if task.project_id is None:
            task.project_id = section.project_id

    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return _task_to_response(task)


# ── DELETE /todos/tasks/{task_id} ──────────────────────────────────────────────

@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete a task owned by the current user."""
    task = _get_task_or_404(task_id, current_user.id, db)
    db.delete(task)
    db.commit()
