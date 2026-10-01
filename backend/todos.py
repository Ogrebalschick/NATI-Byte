"""
Task Manager router — Todoist-style to-do lists for students.

All endpoints require a valid JWT (via get_current_user).

Routes:
    GET  /todos/data                  — full project/section/task tree
    POST /todos/projects              — create project
    POST /todos/sections              — create section inside a project
    POST /todos/tasks                 — create task
    PUT  /todos/tasks/{task_id}       — update task
    DELETE /todos/tasks/{task_id}     — delete task
"""

from datetime import datetime
from typing import List

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


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_project_or_404(project_id: int, user_id: int, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == user_id,
    ).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Проект не найден")
    return project


def _get_task_or_404(task_id: int, user_id: int, db: Session) -> Task:
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_id == user_id,
    ).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    return task


def _task_to_response(task: Task) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        user_id=task.user_id,
        project_id=task.project_id,
        section_id=task.section_id,
        title=task.title,
        description=task.description or "",
        due_date=task.due_date,
        priority=task.priority,
        is_completed=task.is_completed,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


# ── GET /todos/data ───────────────────────────────────────────────────────────

@router.get("/data", response_model=TodosDataResponse)
def get_todos_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return the complete task-manager tree for the authenticated user in one query:
    - projects  → sections → tasks (within section)
                → inbox_tasks (tasks in project but no section)
    - inbox_tasks (tasks with no project at all)
    """
    # Eagerly load sections and their tasks, plus project-level tasks
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

    # Tasks with no project (true inbox)
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
        # IDs of tasks already placed in a section
        sectioned_task_ids: set = set()

        for section in sorted(project.sections, key=lambda s: s.position):
            active_section_tasks = [
                _task_to_response(t)
                for t in sorted(section.tasks, key=lambda t: t.created_at)
                if not t.is_completed
            ]
            sectioned_task_ids.update(t.id for t in section.tasks)
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


# ── POST /todos/projects ──────────────────────────────────────────────────────

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


# ── POST /todos/sections ──────────────────────────────────────────────────────

@router.post("/sections", response_model=SectionResponse, status_code=status.HTTP_201_CREATED)
def create_section(
    payload: SectionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a section inside a project that belongs to the current user."""
    # Verify the project exists and belongs to this user
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


# ── POST /todos/tasks ─────────────────────────────────────────────────────────

@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new task.
    - If section_id is given, project_id must match the section's project.
    - Validates that project and section (when provided) belong to the current user.
    """
    # Validate project ownership
    if payload.project_id is not None:
        _get_project_or_404(payload.project_id, current_user.id, db)

    # Validate section ownership and consistency
    if payload.section_id is not None:
        section = db.query(Section).filter(Section.id == payload.section_id).first()
        if not section:
            raise HTTPException(status_code=404, detail="Раздел не найден")
        # Check that section belongs to the given project (or any project of this user)
        _get_project_or_404(section.project_id, current_user.id, db)
        if payload.project_id is not None and section.project_id != payload.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Раздел не принадлежит указанному проекту",
            )

    now = datetime.utcnow()
    task = Task(
        user_id=current_user.id,
        project_id=payload.project_id,
        section_id=payload.section_id,
        title=payload.title.strip(),
        description=payload.description or "",
        due_date=payload.due_date,
        priority=payload.priority,
        is_completed=False,
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task_to_response(task)


# ── PUT /todos/tasks/{task_id} ────────────────────────────────────────────────

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
    """
    task = _get_task_or_404(task_id, current_user.id, db)

    if payload.title is not None:
        task.title = payload.title.strip()
    if payload.description is not None:
        task.description = payload.description
    if payload.due_date is not None:
        task.due_date = payload.due_date
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
        # Auto-assign project when moving to a section
        if task.project_id is None:
            task.project_id = section.project_id

    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return _task_to_response(task)


# ── DELETE /todos/tasks/{task_id} ─────────────────────────────────────────────

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
