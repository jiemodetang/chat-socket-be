const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

module.exports = (io) => {
  // 存储在线用户
  const onlineUsers = new Map();

  // 中间件：验证用户身份
  io.use(async (socket, next) => {
    try {
      // 支持从 query 或 auth 中获取 token
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('未授权：缺少令牌'));
      }
      
      // 验证令牌
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // 获取用户信息
      const user = await User.findById(decoded.id);
      if (!user) {
        return next(new Error('未授权：用户不存在'));
      }
      
      // 将用户信息添加到socket对象
      socket.user = user;
      next();
    } catch (error) {
      console.error('Socket认证错误:', error);
      return next(new Error('未授权：无效的令牌'));
    }
  });

  io.on('connection', async (socket) => {
    try {
      console.log(`用户已连接: ${socket.user.username} (${socket.user._id})`);
      
      // 将用户添加到在线用户列表
      onlineUsers.set(socket.user._id.toString(), socket.id);
      
      // 更新用户状态为在线
      await User.findByIdAndUpdate(socket.user._id, {
        status: 'online',
        lastActive: Date.now()
      });
      
      // 发送在线用户列表给所有用户
      io.emit('users-online', Array.from(onlineUsers.keys()));
      
      // 加入用户参与的所有聊天室
      const userChats = await Chat.find({
        users: { $elemMatch: { $eq: socket.user._id } }
      });
      
      userChats.forEach(chat => {
        socket.join(chat._id.toString());
        console.log(`用户 ${socket.user.username} 加入聊天室: ${chat._id}`);
      });

      // 发送连接成功消息
      socket.emit('connected', {
        userId: socket.user._id,
        username: socket.user.username
      });
      
      // 处理用户发送消息
      socket.on('send-message', async (data) => {
        try {
          const { content, chatId, messageType = 'text', fileUrl = '' } = data;
          
          if (!content || !chatId) {
            socket.emit('error', { message: '消息内容和聊天ID不能为空' });
            return;
          }
          
          // 检查聊天是否存在
          const chat = await Chat.findById(chatId);
          if (!chat) {
            socket.emit('error', { message: '聊天不存在' });
            return;
          }
          
          // 检查用户是否在聊天中
          if (!chat.users.includes(socket.user._id)) {
            socket.emit('error', { message: '您不是该聊天的成员' });
            return;
          }
          
          // 创建新消息
          const newMessage = await Message.create({
            sender: socket.user._id,
            content,
            chat: chatId,
            readBy: [socket.user._id],
            messageType,
            fileUrl
          });
          
          // 填充消息信息
          const message = await Message.findById(newMessage._id)
            .populate('sender', 'username avatar email')
            .populate('chat');
          
          // 更新聊天的最新消息
          await Chat.findByIdAndUpdate(chatId, {
            latestMessage: message._id
          });
          console.log(chatId);
          // 向聊天室发送消息
          io.to(chatId).emit('new-message', message);
          
          
          // 向聊天成员发送通知（如果不在线）
          chat.users.forEach(userId => {
            const userIdStr = userId.toString();
            
            // 跳过发送者
            if (userIdStr === socket.user._id.toString()) return;
            
            // 获取用户的socket ID
            const userSocketId = onlineUsers.get(userIdStr);
            
            if (userSocketId) {
              // 异步函数处理消息通知
              const sendNotification = async () => {
                try {
                  // 获取完整的聊天信息（包含用户详情）
                  const populatedChat = await Chat.findById(chat._id)
                    .populate('users', '-password')
                    .populate('groupAdmin', '-password')
                    .populate('latestMessage');

                  // 填充最新消息的发送者信息
                  const fullChat = await User.populate(populatedChat, {
                    path: 'latestMessage.sender',
                    select: 'username avatar email'
                  });

                  // 用户在线，发送新消息通知
                  io.to(userSocketId).emit('message-notification', {
                    chat: fullChat,
                    message: message
                  });
                } catch (error) {
                  console.error('发送消息通知错误:', error);
                }
              };
              
              sendNotification();
            }
          });
        } catch (error) {
          console.error('发送消息错误:', error);
          socket.emit('error', { message: '发送消息失败' });
        }
      });
      
      // 处理用户正在输入
      socket.on('typing', (chatId) => {
        socket.to(chatId).emit('typing', {
          chatId,
          user: {
            _id: socket.user._id,
            username: socket.user.username
          }
        });
      });
      
      // 处理用户停止输入
      socket.on('stop-typing', (chatId) => {
        socket.to(chatId).emit('stop-typing', {
          chatId,
          user: {
            _id: socket.user._id,
            username: socket.user.username
          }
        });
      });
      
      // 处理标记消息为已读
      socket.on('mark-read', async (messageId) => {
        try {
          const message = await Message.findById(messageId);
          
          if (!message) {
            socket.emit('error', { message: '消息不存在' });
            return;
          }
          
          // 检查用户是否在聊天中
          const chat = await Chat.findById(message.chat);
          if (!chat.users.includes(socket.user._id)) {
            socket.emit('error', { message: '您不是该聊天的成员' });
            return;
          }
          
          // 标记消息为已读
          if (!message.readBy.includes(socket.user._id)) {
            await Message.findByIdAndUpdate(messageId, {
              $addToSet: { readBy: socket.user._id }
            });
            
            // 通知其他用户消息已读
            io.to(message.chat.toString()).emit('message-read', {
              messageId,
              userId: socket.user._id
            });
          }
        } catch (error) {
          console.error('标记已读错误:', error);
          socket.emit('error', { message: '标记已读失败' });
        }
      });
      
      // 处理加入聊天室
      socket.on('join-chat', (chatId) => {
        socket.join(chatId);
        console.log(`用户 ${socket.user.username} 加入聊天室: ${chatId}`);
      });
      
      // 处理离开聊天室
      socket.on('leave-chat', (chatId) => {
        socket.leave(chatId);
        console.log(`用户 ${socket.user.username} 离开聊天室: ${chatId}`);
      });
      
      // 处理用户断开连接
      socket.on('disconnect', async () => {
        console.log(`用户已断开连接: ${socket.user.username} (${socket.user._id})`);
        
        // 从在线用户列表中移除
        onlineUsers.delete(socket.user._id.toString());
        
        // 更新用户状态为离线
        await User.findByIdAndUpdate(socket.user._id, {
          status: 'offline',
          lastActive: Date.now()
        });
        
        // 发送在线用户列表给所有用户
        io.emit('users-online', Array.from(onlineUsers.keys()));
      });
    } catch (error) {
      console.error('Socket连接处理错误:', error);
      socket.emit('error', { message: '连接处理失败' });
    }
  });
};