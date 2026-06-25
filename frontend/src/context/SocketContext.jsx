import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('glassesToken');
    if (!user || !token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // Nhắm mục tiêu máy chủ backend thông qua proxy của Vite (hoặc trực tiếp trong prod)
    const socketUrl = window.location.origin;

    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000
    });

    newSocket.on('connect', () => {
      console.log('🔌 [Socket.IO Client] Đã kết nối thành công tới máy chủ realtime!');
    });

    newSocket.on('connect_error', (err) => {
      console.warn('⚠️ [Socket.IO Client] Lỗi kết nối socket:', err.message);
    });

    setSocket(newSocket);

    // Cleanup đóng kết nối khi người dùng Logout hoặc unmount
    return () => {
      newSocket.disconnect();
      console.log('🔌 [Socket.IO Client] Đã ngắt kết nối socket dọn dẹp.');
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
