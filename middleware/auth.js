const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');

// 保护路由中间件 - 验证用户是否已登录
const protect = async (req, res, next) => {
  try {
    let token;
    
    // 检查请求头中是否包含令牌
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // 如果没有令牌，返回未授权错误
    if (!token) {
      return next(new AppError('您未登录，请先登录访问', 401));
    }
    
    // 验证令牌
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 检查用户是否仍然存在
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return next(new AppError('此令牌的用户不存在', 401));
    }
    
    // 将用户信息添加到请求对象
    req.user = currentUser;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('无效的令牌，请重新登录', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('您的令牌已过期，请重新登录', 401));
    }
    next(error);
  }
};

// 限制角色访问中间件
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('您没有权限执行此操作', 403));
    }
    next();
  };
};

module.exports = {
  protect,
  restrictTo
};