const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');

// 获取用户的所有聊天
exports.getUserChats = async (req, res, next) => {
  try {
    // 查找用户参与的所有聊天
    const chats = await Chat.find({
      users: { $elemMatch: { $eq: req.user._id } }
    })
      .populate('users', '-password')
      .populate('groupAdmin', '-password')
      .populate('latestMessage')
      .sort({ updatedAt: -1 });

    // 填充最新消息的发送者信息
    const populatedChats = await User.populate(chats, {
      path: 'latestMessage.sender',
      select: 'username avatar email'
    });

    res.status(200).json({
      status: 'success',
      results: populatedChats.length,
      data: {
        chats: populatedChats
      }
    });
  } catch (error) {
    next(error);
  }
};

// 创建或访问单聊
exports.accessChat = async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return next(new AppError('请提供用户ID', 400));
    }

    // 检查用户是否存在
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: '未找到该用户'
      });
    }

    // 查找或创建单聊
    let chat = await Chat.findOne({
      isGroupChat: false,
      users: {
        $all: [req.user._id, userId],
        $size: 2
      }
    })
      .populate('users', '-password')
      .populate('latestMessage');

    // 填充最新消息的发送者信息
    if (chat) {
      chat = await User.populate(chat, {
        path: 'latestMessage.sender',
        select: 'username avatar email'
      });
    } else {
      // 创建新的单聊
      chat = await Chat.create({
        chatName: 'sender',
        isGroupChat: false,
        users: [req.user._id, userId]
      });

      chat = await Chat.findById(chat._id).populate('users', '-password');
    }

    res.status(200).json({
      status: 'success',
      data: {
        chat
      }
    });
  } catch (error) {
    next(error);
  }
};

// 创建群聊
exports.createGroupChat = async (req, res, next) => {
  try {
    const { name, users } = req.body;

    if (!name || !users) {
      return next(new AppError('请提供群聊名称和用户列表', 400));
    }

    // 解析用户列表
    let userIds;
    try {
      userIds = JSON.parse(users);
    } catch (error) {
      return next(new AppError('用户列表格式不正确', 400));
    }

    // 群聊至少需要3个用户（包括创建者）
    if (userIds.length < 2) {
      return next(new AppError('群聊至少需要3个用户（包括您自己）', 400));
    }

    // 添加当前用户到群聊
    userIds.push(req.user._id.toString());

    // 创建群聊
    const groupChat = await Chat.create({
      chatName: name,
      isGroupChat: true,
      users: userIds,
      groupAdmin: req.user._id
    });

    // 获取完整的群聊信息
    const fullGroupChat = await Chat.findById(groupChat._id)
      .populate('users', '-password')
      .populate('groupAdmin', '-password');

    res.status(201).json({
      status: 'success',
      data: {
        chat: fullGroupChat
      }
    });
  } catch (error) {
    next(error);
  }
};

// 重命名群聊
exports.renameGroupChat = async (req, res, next) => {
  try {
    const { chatId, chatName } = req.body;

    if (!chatId || !chatName) {
      return next(new AppError('请提供聊天ID和新名称', 400));
    }

    // 更新群聊名称
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { chatName },
      { new: true }
    )
      .populate('users', '-password')
      .populate('groupAdmin', '-password');

    if (!updatedChat) {
      return next(new AppError('未找到该群聊', 404));
    }

    // 检查是否为群聊
    if (!updatedChat.isGroupChat) {
      return next(new AppError('只能重命名群聊', 400));
    }

    res.status(200).json({
      status: 'success',
      data: {
        chat: updatedChat
      }
    });
  } catch (error) {
    next(error);
  }
};

// 添加用户到群聊
exports.addToGroupChat = async (req, res, next) => {
  try {
    const { chatId, userId } = req.body;

    if (!chatId || !userId) {
      return next(new AppError('请提供聊天ID和用户ID', 400));
    }

    // 查找群聊
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return next(new AppError('未找到该群聊', 404));
    }

    // 检查是否为群聊
    if (!chat.isGroupChat) {
      return next(new AppError('只能向群聊添加用户', 400));
    }

    // 检查是否为群管理员
    if (chat.groupAdmin.toString() !== req.user._id.toString()) {
      return next(new AppError('只有群管理员可以添加用户', 403));
    }

    // 检查用户是否已在群聊中
    if (chat.users.includes(userId)) {
      return next(new AppError('该用户已在群聊中', 400));
    }

    // 添加用户到群聊
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { $push: { users: userId } },
      { new: true }
    )
      .populate('users', '-password')
      .populate('groupAdmin', '-password');

    res.status(200).json({
      status: 'success',
      data: {
        chat: updatedChat
      }
    });
  } catch (error) {
    next(error);
  }
};

// 从群聊中移除用户
exports.removeFromGroupChat = async (req, res, next) => {
  try {
    const { chatId, userId } = req.body;

    if (!chatId || !userId) {
      return next(new AppError('请提供聊天ID和用户ID', 400));
    }

    // 查找群聊
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return next(new AppError('未找到该群聊', 404));
    }

    // 检查是否为群聊
    if (!chat.isGroupChat) {
      return next(new AppError('只能从群聊中移除用户', 400));
    }

    // 检查是否为群管理员或自己退出
    const isAdmin = chat.groupAdmin.toString() === req.user._id.toString();
    const isSelfLeaving = userId === req.user._id.toString();

    if (!isAdmin && !isSelfLeaving) {
      return next(new AppError('只有群管理员可以移除其他用户', 403));
    }

    // 不能移除群管理员（除非是管理员自己退出）
    if (userId === chat.groupAdmin.toString() && !isSelfLeaving) {
      return next(new AppError('不能移除群管理员', 400));
    }

    // 从群聊中移除用户
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { $pull: { users: userId } },
      { new: true }
    )
      .populate('users', '-password')
      .populate('groupAdmin', '-password');

    // 如果管理员退出，指定新的管理员
    if (isSelfLeaving && isAdmin && updatedChat.users.length > 0) {
      updatedChat.groupAdmin = updatedChat.users[0]._id;
      await updatedChat.save();
    }

    res.status(200).json({
      status: 'success',
      data: {
        chat: updatedChat
      }
    });
  } catch (error) {
    next(error);
  }
};

// 获取聊天消息
exports.getChatMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;

    // 查找聊天
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return next(new AppError('未找到该聊天', 404));
    }

    // 检查用户是否在聊天中
    if (!chat.users.includes(req.user._id)) {
      return next(new AppError('您不是该聊天的成员', 403));
    }

    // 获取聊天消息
    const messages = await Message.find({ chat: chatId })
      .populate('sender', 'username avatar email')
      .populate('chat')
      .select('content sender chat readBy messageType fileUrl fileName fileSize fileType duration createdAt updatedAt')
      .sort({ createdAt: 1 });

    // 标记消息为已读
    await Message.updateMany(
      {
        chat: chatId,
        readBy: { $ne: req.user._id }
      },
      {
        $addToSet: { readBy: req.user._id }
      }
    );

    res.status(200).json({
      status: 'success',
      results: messages.length,
      data: {
        messages
      }
    });
  } catch (error) {
    next(error);
  }
};

// 发送消息
exports.sendMessage = async (req, res, next) => {
  try {
    const { content, chatId, duration } = req.body;

    if (!content || !chatId) {
      return next(new AppError('请提供消息内容和聊天ID', 400));
    }

    // 查找聊天
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return next(new AppError('未找到该聊天', 404));
    }

    // 检查用户是否在聊天中
    if (!chat.users.includes(req.user._id)) {
      return next(new AppError('您不是该聊天的成员', 403));
    }

    // 创建新消息
    let message = await Message.create({
      sender: req.user._id,
      content,
      chat: chatId,
      readBy: [req.user._id], // 发送者已读
      duration: duration || undefined // 添加 duration 字段
    });

    // 填充消息信息
    message = await Message.findById(message._id)
      .populate('sender', 'username avatar email')
      .populate('chat');

    // 更新聊天的最新消息
    await Chat.findByIdAndUpdate(chatId, {
      latestMessage: message._id
    });

    res.status(201).json({
      status: 'success',
      data: {
        message
      }
    });
  } catch (error) {
    next(error);
  }
};

// 上传文件
exports.uploadFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('请选择要上传的文件', 400));
    }

    // 返回文件信息
    res.status(201).json({
      status: 'success',
      data: {
        file: {
          url: `/uploads/${req.file.filename}`,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          fileType: req.file.mimetype
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

