const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');

// 获取所有用户
exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({}).select('-password');
    
    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        users
      }
    });
  } catch (error) {
    next(error);
  }
};

// 获取单个用户
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return next(new AppError('未找到该用户', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        user
      }
    });
  } catch (error) {
    next(error);
  }
};

// 更新用户信息
exports.updateUser = async (req, res, next) => {
  try {
    // 不允许更新密码
    if (req.body.password) {
      return next(new AppError('此路由不用于密码更新', 400));
    }
    
    // 只允许更新特定字段
    const allowedFields = ['username', 'email', 'avatar', 'status'];
    const filteredBody = {};
    
    Object.keys(req.body).forEach(field => {
      if (allowedFields.includes(field)) {
        filteredBody[field] = req.body[field];
      }
    });
    
    // 更新用户
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      filteredBody,
      {
        new: true,
        runValidators: true
      }
    ).select('-password');
    
    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    next(error);
  }
};

// 添加好友请求
exports.sendFriendRequest = async (req, res, next) => {
  try {
    const { friendId } = req.body;
    
    // 检查好友ID是否存在
    if (!friendId) {
      return next(new AppError('请提供好友ID', 400));
    }
    
    // 检查好友是否存在
    const friend = await User.findById(friendId);
    if (!friend) {
      return next(new AppError('未找到该用户', 404));
    }
    
    // 检查是否已经是好友
    const user = await User.findById(req.user._id);
    if (user.friends.includes(friendId)) {
      return next(new AppError('该用户已经是您的好友', 400));
    }
    
    // 不能添加自己为好友
    if (user._id.toString() === friendId) {
      return next(new AppError('不能添加自己为好友', 400));
    }
    
    // 检查是否已经发送过好友请求
    const existingRequest = friend.friendRequests.find(
      request => request.sender.toString() === user._id.toString() && request.status === 'pending'
    );
    
    if (existingRequest) {
      return next(new AppError('您已经向该用户发送过好友请求', 400));
    }
    
    // 检查对方是否已经向你发送了好友请求
    const pendingRequest = user.friendRequests.find(
      request => request.sender.toString() === friendId && request.status === 'pending'
    );
    
    if (pendingRequest) {
      return next(new AppError('该用户已经向您发送了好友请求，请先处理该请求', 400));
    }
    
    // 添加好友请求
    friend.friendRequests.push({
      sender: user._id,
      status: 'pending',
      createdAt: Date.now()
    });
    
    await friend.save({ validateBeforeSave: false });
    
    res.status(200).json({
      status: 'success',
      message: '好友请求已发送',
      data: {
        user: await User.findById(user._id).select('-password')
      }
    });
  } catch (error) {
    next(error);
  }
};

// 接受好友请求
exports.acceptFriendRequest = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    
    if (!requestId) {
      return next(new AppError('请提供请求ID', 400));
    }
    
    const user = await User.findById(req.user._id);
    
    // 查找好友请求
    const requestIndex = user.friendRequests.findIndex(
      request => request._id.toString() === requestId
    );
    
    if (requestIndex === -1) {
      return next(new AppError('未找到该好友请求', 404));
    }
    
    const request = user.friendRequests[requestIndex];
    
    if (request.status !== 'pending') {
      return next(new AppError('该请求已被处理', 400));
    }
    
    const senderId = request.sender;
    const sender = await User.findById(senderId);
    
    if (!sender) {
      return next(new AppError('请求发送者不存在', 404));
    }
    
    // 更新请求状态
    user.friendRequests[requestIndex].status = 'accepted';
    
    // 添加好友关系（双向）
    if (!user.friends.includes(senderId)) {
      user.friends.push(senderId);
    }
    
    await user.save({ validateBeforeSave: false });
    
    if (!sender.friends.includes(user._id)) {
      sender.friends.push(user._id);
    }
    
    await sender.save({ validateBeforeSave: false });
    
    res.status(200).json({
      status: 'success',
      message: '已接受好友请求',
      data: {
        user: await User.findById(user._id)
          .select('-password')
          .populate('friends', '-password')
      }
    });
  } catch (error) {
    next(error);
  }
};

// 拒绝好友请求
exports.rejectFriendRequest = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    
    if (!requestId) {
      return next(new AppError('请提供请求ID', 400));
    }
    
    const user = await User.findById(req.user._id);
    
    // 查找好友请求
    const requestIndex = user.friendRequests.findIndex(
      request => request._id.toString() === requestId
    );
    
    if (requestIndex === -1) {
      return next(new AppError('未找到该好友请求', 404));
    }
    
    const request = user.friendRequests[requestIndex];
    
    if (request.status !== 'pending') {
      return next(new AppError('该请求已被处理', 400));
    }
    
    // 更新请求状态
    user.friendRequests[requestIndex].status = 'rejected';
    await user.save({ validateBeforeSave: false });
    
    res.status(200).json({
      status: 'success',
      message: '已拒绝好友请求',
      data: {
        user: await User.findById(user._id).select('-password')
      }
    });
  } catch (error) {
    next(error);
  }
};

// 获取待处理的好友请求
exports.getPendingFriendRequests = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'friendRequests.sender',
        select: 'username avatar email'
      });
    
    const pendingRequests = user.friendRequests.filter(
      request => request.status === 'pending'
    );
    
    res.status(200).json({
      status: 'success',
      results: pendingRequests.length,
      data: {
        requests: pendingRequests
      }
    });
  } catch (error) {
    next(error);
  }
};

// 删除好友
exports.removeFriend = async (req, res, next) => {
  try {
    const { friendId } = req.params;
    
    // 检查好友是否存在
    const friend = await User.findById(friendId);
    if (!friend) {
      return next(new AppError('未找到该用户', 404));
    }
    
    // 检查是否是好友
    const user = await User.findById(req.user._id);
    if (!user.friends.includes(friendId)) {
      return next(new AppError('该用户不是您的好友', 400));
    }
    
    // 删除好友（双向）
    user.friends = user.friends.filter(
      id => id.toString() !== friendId
    );
    await user.save({ validateBeforeSave: false });
    
    friend.friends = friend.friends.filter(
      id => id.toString() !== user._id.toString()
    );
    await friend.save({ validateBeforeSave: false });
    
    res.status(200).json({
      status: 'success',
      message: '成功删除好友',
      data: {
        user: await User.findById(user._id).select('-password')
      }
    });
  } catch (error) {
    next(error);
  }
};

// 获取好友列表
exports.getFriends = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('friends', '-password')
      .select('-password');
    
    res.status(200).json({
      status: 'success',
      results: user.friends.length,
      data: {
        friends: user.friends
      }
    });
  } catch (error) {
    next(error);
  }
};

// 搜索用户
exports.searchUsers = async (req, res, next) => {
  try {
    const { keyword } = req.query;
    
    if (!keyword) {
      return next(new AppError('请提供搜索关键词', 400));
    }
    
    const users = await User.find({
      $or: [
        { username: { $regex: keyword, $options: 'i' } },
        { email: { $regex: keyword, $options: 'i' } }
      ],
      _id: { $ne: req.user._id } // 排除当前用户
    }).select('-password');
    
    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        users
      }
    });
  } catch (error) {
    next(error);
  }
};

// 上传用户头像
exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('请选择要上传的头像', 400));
    }

    // 获取用户
    const user = await User.findById(req.user._id);
    if (!user) {
      return next(new AppError('用户不存在', 404));
    }

    // 更新用户头像
    const avatarPath = `/avatars/${req.file.filename}`;
    user.avatar = avatarPath;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          _id: user._id,
          username: user.username,
          avatar: avatarPath,
          email: user.email,
          status: user.status
        },
        file: {
          url: avatarPath,
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