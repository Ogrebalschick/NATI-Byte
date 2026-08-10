import { Image } from 'expo-image';
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
let HelloByte = () => {
    const helloMessages = ['Готов когда ты готов!', 'Всегда готов!', 'С чего начнём?', 'Что нового?'];
    const [helloMessage, setHelloMessage] = useState('')
    // Функция, которая выдает случайное целое число между min и max (включительно)
    function getRandomInt(min: number, max: number) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    useEffect(() => {
        const randomNum = getRandomInt(0, helloMessages.length - 1);
        setHelloMessage(helloMessages[randomNum]);
    }, [])
    
    return (
        <View style={[styles.helloByteWrap]}>
            <View style={[styles.helloByte]}>
                <Image source={require('@/../assets/images/nstu.png')} style={[styles.ByteImage]} contentFit="cover" transition={1000} />
                <Text style={[styles.ByteMessage]}>{helloMessage}</Text>
            </View>
        </View>
    )
}
const styles = StyleSheet.create({
    helloByteWrap: {
        flex: 1,       
        justifyContent: 'center',
        alignItems: 'center'
    },
    helloByte: {
        gap: 10
    },
    ByteImage: {
        justifyContent: 'center',
        textAlign: 'center',
        margin: 'auto',
        width: 150,
        height: 150,
    },
    ByteMessage: {
        textAlign: 'center',
        color: '#fff',
        fontSize: 24
    },

})
export default HelloByte;