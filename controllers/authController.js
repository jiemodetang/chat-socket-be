const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { AppError } = require('../utils/errorHandler');

// 用户注册
exports.register = async (req, res, next) => {
  try {
    const { username, email, password,avatar } = req.body;

    // 检查用户名和邮箱是否已存在
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      return next(new AppError('用户名或邮箱已被使用', 400));
    }
    

    // 创建新用户
    const newUser = await User.create({
      username,
      email,
      password,
      avatar
    });

    // 生成JWT令牌
    const token = generateToken(newUser._id);

    // 返回用户信息（不包含密码）
    const userWithoutPassword = {
      _id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      avatar: newUser.avatar,
      status: newUser.status,
      createdAt: newUser.createdAt
    };

    res.status(201).json({
      status: 'success',
      data: {
        user: userWithoutPassword,
        token:token
      }
    });
  } catch (error) {
    next(error);
  }
};

// 用户登录
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 检查是否提供了用户名和密码
    if (!email || !password) {
      return next(new AppError('请提供用户名和密码', 400));
    }
    // 查找用户并选择密码字段（默认不选择）
    // 支持通过邮箱或用户名登录
    const user = await User.findOne({
      $or: [
        { email },
        { username: email } // 将输入的email参数同时作为用户名查询
      ]
    }).select('+password');

    // 检查用户是否存在
    if (!user) {
      return next(new AppError('用户名或密码错误', 400));
    }
    
    // 检查密码是否正确
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return next(new AppError('用户名或密码错误', 400));
    }

    // 更新用户状态为在线
    user.status = 'online';
    user.lastActive = Date.now();
    await user.save({ validateBeforeSave: false });

    // 生成JWT令牌
    const token = generateToken(user._id);

    // 返回用户信息（不包含密码）
    const userWithoutPassword = {
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      status: user.status,
      friends: user.friends,
      createdAt: user.createdAt
    };

    res.status(200).json({
      status: 'success',
      data: {
        user: userWithoutPassword,
        token:token
      }
    });
  } catch (error) {
    next(error);
  }
};

// 获取当前登录用户信息
exports.getCurrentUser = async (req, res, next) => {
  try {
    // 用户信息已在auth中间件中添加到req对象
    const user = req.user;

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          status: user.status,
          friends: user.friends,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// 用户登出
exports.logout = async (req, res, next) => {
  try {
    // 更新用户状态为离线
    const user = req.user;
    user.status = 'offline';
    user.lastActive = Date.now();
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      status: 'success',
      message: '成功登出'
    });
  } catch (error) {
    next(error);
  }
};