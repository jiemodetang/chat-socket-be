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

// 添加好友
exports.addFriend = async (req, res, next) => {
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
    
    // 添加好友（双向）
    user.friends.push(friendId);
    await user.save({ validateBeforeSave: false });
    
    friend.friends.push(user._id);
    await friend.save({ validateBeforeSave: false });
    
    res.status(200).json({
      status: 'success',
      message: '成功添加好友',
      data: {
        user: await User.findById(user._id).select('-password')
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