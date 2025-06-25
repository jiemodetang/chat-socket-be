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
            
            const { content, chatId, messageType = 'text', fileUrl = '', duration, fileName = '', fileSize = 0 } = data;
            
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
              fileName,
              fileSize,
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
          } else if (message.type === 'friend-request') {
            // 处理好友请求
            const { targetUserId } = message.data;
            
            // 检查目标用户是否存在
            const targetUser = await User.findById(targetUserId);
            if (!targetUser) {
              sendMessage(ws, 'error', { message: '用户不存在' });
              return;
            }
            
            // 检查是否已经是好友
            if (user.friends.includes(targetUserId)) {
              sendMessage(ws, 'error', { message: '该用户已经是您的好友' });
              return;
            }
            
            // 检查是否已经发送过好友请求
            const existingRequest = targetUser.friendRequests.find(
              request => request.sender.toString() === user._id.toString() && request.status === 'pending'
            );
            
            if (existingRequest) {
              sendMessage(ws, 'error', { message: '您已经向该用户发送过好友请求' });
              return;
            }
            
            // 添加好友请求
            targetUser.friendRequests.push({
              sender: user._id,
              status: 'pending',
              createdAt: Date.now()
            });
            
            await targetUser.save({ validateBeforeSave: false });
            
            // 如果目标用户在线，发送通知
            const targetWs = onlineUsers.get(targetUserId);
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              // 获取完整的请求信息以便前端显示
              const populatedUser = await User.findById(user._id).select('username avatar email');
              
              sendMessage(targetWs, 'friend-request-received', {
                request: {
                  sender: populatedUser,
                  status: 'pending',
                  createdAt: Date.now()
                }
              });
            }
            
            sendMessage(ws, 'friend-request-sent', {
              message: '好友请求已发送',
              targetUser: {
                _id: targetUser._id,
                username: targetUser.username,
                avatar: targetUser.avatar
              }
            });
            
          } else if (message.type === 'friend-request-response') {
            // 处理好友请求响应
            const { requestId, response } = message.data;
            
            if (!['accepted', 'rejected'].includes(response)) {
              sendMessage(ws, 'error', { message: '无效的响应' });
              return;
            }
            
            // 查找请求
            const userDoc = await User.findById(user._id);
            const requestIndex = userDoc.friendRequests.findIndex(
              request => request._id.toString() === requestId
            );
            
            if (requestIndex === -1) {
              sendMessage(ws, 'error', { message: '未找到该好友请求' });
              return;
            }
            
            const request = userDoc.friendRequests[requestIndex];
            
            if (request.status !== 'pending') {
              sendMessage(ws, 'error', { message: '该请求已被处理' });
              return;
            }
            
            const senderId = request.sender;
            const sender = await User.findById(senderId);
            
            if (!sender) {
              sendMessage(ws, 'error', { message: '请求发送者不存在' });
              return;
            }
            
            // 更新请求状态
            userDoc.friendRequests[requestIndex].status = response;
            
            if (response === 'accepted') {
              // 添加好友关系（双向）
              if (!userDoc.friends.includes(senderId)) {
                userDoc.friends.push(senderId);
              }
              
              if (!sender.friends.includes(user._id)) {
                sender.friends.push(user._id);
              }
              
              await sender.save({ validateBeforeSave: false });
            }
            
            await userDoc.save({ validateBeforeSave: false });
            
            // 如果发送者在线，发送通知
            const senderWs = onlineUsers.get(senderId.toString());
            if (senderWs && senderWs.readyState === WebSocket.OPEN) {
              if (response === 'accepted') {
                sendMessage(senderWs, 'friend-request-accepted', {
                  message: '好友请求已接受',
                  user: {
                    _id: user._id,
                    username: user.username,
                    avatar: user.avatar
                  }
                });
              } else {
                sendMessage(senderWs, 'friend-request-rejected', {
                  message: '好友请求已拒绝',
                  userId: user._id
                });
              }
            }
            
            sendMessage(ws, 'friend-request-processed', {
              message: response === 'accepted' ? '已接受好友请求' : '已拒绝好友请求',
              requestId
            });
          } else if (message.type === 'call') {
            // 处理发起通话请求
            const { targetUserId, callType, roomId } = message.data;
            
            // 检查目标用户是否在线
            const targetWs = onlineUsers.get(targetUserId);
            if (!targetWs) {
              sendMessage(ws, 'error', { message: '对方不在线' });
              return;
            }

            // 发送通话请求给目标用户
            sendMessage(targetWs, 'incoming-call', {
              caller: {
                _id: user._id,
                username: user.username,
                avatar: user.avatar
              },
              callType, // 'audio' 或 'video'
              roomId
            });

          } else if (message.type === 'call-accepted') {
            // 处理接受通话请求
            const { callerId, roomId } = message.data;
            
            // 通知发起方通话被接受
            const callerWs = onlineUsers.get(callerId);
            if (callerWs) {
              sendMessage(callerWs, 'call-accepted', {
                roomId,
                callee: {
                  _id: user._id,
                  username: user.username,
                  avatar: user.avatar
                }
              });
            }

          } else if (message.type === 'call-rejected') {
            // 处理拒绝通话请求
            const { callerId, reason } = message.data;
            
            // 通知发起方通话被拒绝
            const callerWs = onlineUsers.get(callerId);
            if (callerWs) {
              sendMessage(callerWs, 'call-rejected', {
                reason: reason || '对方拒绝了通话'
              });
            }

          } else if (message.type === 'call-ended') {
            // 处理通话结束
            const { targetUserId, roomId } = message.data;
            
            // 通知对方通话已结束
            const targetWs = onlineUsers.get(targetUserId);
            if (targetWs) {
              sendMessage(targetWs, 'call-ended', {
                roomId,
                userId: user._id
              });
            }

          } else if (message.type === 'ice-candidate') {
            // 处理 ICE 候选者
            const { targetUserId, candidate, roomId } = message.data;
            
            // 转发 ICE 候选者给对方
            const targetWs = onlineUsers.get(targetUserId);
            if (targetWs) {
              sendMessage(targetWs, 'ice-candidate', {
                candidate,
                roomId,
                userId: user._id
              });
            }

          } else if (message.type === 'offer') {
            // 处理 WebRTC offer
            const { targetUserId, offer, roomId } = message.data;
            
            // 转发 offer 给对方
            const targetWs = onlineUsers.get(targetUserId);
            if (targetWs) {
              sendMessage(targetWs, 'offer', {
                offer,
                roomId,
                userId: user._id
              });
            }

          } else if (message.type === 'answer') {
            // 处理 WebRTC answer
            const { targetUserId, answer, roomId } = message.data;
            
            // 转发 answer 给对方
            const targetWs = onlineUsers.get(targetUserId);
            if (targetWs) {
              sendMessage(targetWs, 'answer', {
                answer,
                roomId,
                userId: user._id
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