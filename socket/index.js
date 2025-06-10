const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const WebSocket = require('ws');

module.exports = (server) => {
  // 存储在线用户
  const onlineUsers = new Map();
  
  // 配置WebSocket服务器
  const wss = new WebSocket.Server({ 
    server,
    path: '/',  // 使用根路径
    perMessageDeflate: false,  // 禁用压缩
    clientTracking: true,      // 启用客户端跟踪
    verifyClient: async (info, callback) => {
      try {
        // 从URL中获取token
        const url = new URL(info.req.url, 'ws://localhost');
        const token = url.searchParams.get('token');
        
        if (!token) {
          callback(false, 401, '未授权：缺少令牌');
          return;
        }

        // 验证token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        
        if (!user) {
          callback(false, 401, '未授权：用户不存在');
          return;
        }

        // 将用户信息添加到请求对象中
        info.req.user = user;
        callback(true);
      } catch (error) {
        console.error('WebSocket验证错误:', error);
        callback(false, 401, '未授权：无效的令牌');
      }
    }
  });

  // 发送消息的辅助函数
  const sendMessage = (ws, type, data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type,
        data
      }));
    }
  };

  // 心跳检测
  const heartbeat = (ws) => {
    ws.isAlive = true;
  };

  // 设置心跳检测间隔
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log('客户端未响应心跳，关闭连接');
        return ws.terminate();
      }
      
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('connection', async (ws, req) => {
    try {
      const user = req.user;
      ws.user = user;
      ws.isAlive = true;
      
      // 设置心跳检测
      ws.on('pong', () => heartbeat(ws));
      
      console.log(`用户已连接: ${user.username} (${user._id})`);
      
      // 将用户添加到在线用户列表
      onlineUsers.set(user._id.toString(), ws);
      
      // 更新用户状态为在线
      await User.findByIdAndUpdate(user._id, {
        status: 'online',
        lastActive: Date.now()
      });
      
      // 发送在线用户列表给所有用户
      const onlineUsersList = Array.from(onlineUsers.keys());
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          sendMessage(client, 'users-online', onlineUsersList);
        }
      });
      
      // 加入用户参与的所有聊天室
      const userChats = await Chat.find({
        users: { $elemMatch: { $eq: user._id } }
      });
      
      // 发送连接成功消息
      sendMessage(ws, 'connected', {
        userId: user._id,
        username: user.username
      });

      // 处理消息
      ws.on('message', async (rawMessage) => {
        try {
          console.log('收到原始消息:', rawMessage.toString());
          const message = JSON.parse(rawMessage);
          
          // 处理心跳消息
          if (message.type === 'ping') {
            sendMessage(ws, 'pong', { timestamp: Date.now() });
            return;
          }
          
          if (message.type === 'send-message') {
            const data = message.data;
            console.log('处理发送消息:', data);
            
            const { content, chatId, messageType = 'text', fileUrl = '', duration } = data;
            
            if (!content || !chatId) {
              sendMessage(ws, 'error', { message: '消息内容和聊天ID不能为空' });
              return;
            }
            
            // 检查聊天是否存在
            const chat = await Chat.findById(chatId);
            if (!chat) {
              sendMessage(ws, 'error', { message: '聊天不存在' });
              return;
            }
            
            // 检查用户是否在聊天中
            if (!chat.users.includes(user._id)) {
              sendMessage(ws, 'error', { message: '您不是该聊天的成员' });
              return;
            }
            
            // 创建新消息
            const newMessage = await Message.create({
              sender: user._id,
              content,
              chat: chatId,
              readBy: [user._id],
              messageType,
              fileUrl,
              duration: duration || undefined
            });
            
            // 填充消息信息
            const populatedMessage = await Message.findById(newMessage._id)
              .populate('sender', 'username avatar email')
              .populate('chat');
            
            // 更新聊天的最新消息
            await Chat.findByIdAndUpdate(chatId, {
              latestMessage: populatedMessage._id
            });
            
            // 向聊天室所有成员发送消息
            chat.users.forEach(userId => {
              const userIdStr = userId.toString();
              const userWs = onlineUsers.get(userIdStr);
              
              if (userWs && userWs.readyState === WebSocket.OPEN) {
                sendMessage(userWs, 'new-message', populatedMessage);
              }
            });
          } else if (message.type === 'typing') {
            const { chatId } = message.data;
            // 向聊天室其他成员发送正在输入状态
            const chat = await Chat.findById(chatId);
            if (chat) {
              chat.users.forEach(userId => {
                const userIdStr = userId.toString();
                if (userIdStr !== user._id.toString()) {
                  const userWs = onlineUsers.get(userIdStr);
                  if (userWs && userWs.readyState === WebSocket.OPEN) {
                    sendMessage(userWs, 'typing', {
                      chatId,
                      user: {
                        _id: user._id,
                        username: user.username
                      }
                    });
                  }
                }
              });
            }
          } else if (message.type === 'stop-typing') {
            const { chatId } = message.data;
            // 向聊天室其他成员发送停止输入状态
            const chat = await Chat.findById(chatId);
            if (chat) {
              chat.users.forEach(userId => {
                const userIdStr = userId.toString();
                if (userIdStr !== user._id.toString()) {
                  const userWs = onlineUsers.get(userIdStr);
                  if (userWs && userWs.readyState === WebSocket.OPEN) {
                    sendMessage(userWs, 'stop-typing', {
                      chatId,
                      user: {
                        _id: user._id,
                        username: user.username
                      }
                    });
                  }
                }
              });
            }
          } else if (message.type === 'mark-read') {
            const { messageId } = message.data;
            const message = await Message.findById(messageId);
            
            if (!message) {
              sendMessage(ws, 'error', { message: '消息不存在' });
              return;
            }
            
            // 检查用户是否在聊天中
            const chat = await Chat.findById(message.chat);
            if (!chat.users.includes(user._id)) {
              sendMessage(ws, 'error', { message: '您不是该聊天的成员' });
              return;
            }
            
            // 标记消息为已读
            if (!message.readBy.includes(user._id)) {
              await Message.findByIdAndUpdate(messageId, {
                $addToSet: { readBy: user._id }
              });
              
              // 通知其他用户消息已读
              chat.users.forEach(userId => {
                const userIdStr = userId.toString();
                if (userIdStr !== user._id.toString()) {
                  const userWs = onlineUsers.get(userIdStr);
                  if (userWs && userWs.readyState === WebSocket.OPEN) {
                    sendMessage(userWs, 'message-read', {
                      messageId,
                      userId: user._id
                    });
                  }
                }
              });
            }
          }
        } catch (error) {
          console.error('处理消息错误:', error);
          sendMessage(ws, 'error', { message: '处理消息失败' });
        }
      });

      // 处理断开连接
      ws.on('close', async () => {
        console.log(`用户已断开连接: ${user.username} (${user._id})`);
        
        // 从在线用户列表中移除
        onlineUsers.delete(user._id.toString());
        
        // 更新用户状态为离线
        await User.findByIdAndUpdate(user._id, {
          status: 'offline',
          lastActive: Date.now()
        });
        
        // 发送在线用户列表给所有用户
        const onlineUsersList = Array.from(onlineUsers.keys());
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            sendMessage(client, 'users-online', onlineUsersList);
          }
        });
      });

    } catch (error) {
      console.error('WebSocket连接处理错误:', error);
      ws.close(1011, '连接处理失败');
    }
  });

  // 清理心跳检测
  wss.on('close', () => {
    clearInterval(interval);
  });
};