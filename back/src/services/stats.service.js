const mongoose = require('mongoose');
const moment = require('moment');
const ErrorResponse = require('../utils/ErrorResponse');
const logger = require('../utils/logger');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

class StatsService {
  /**
   * Obtient les statistiques globales du dashboard
   * @returns {Promise<Object>} Statistiques consolidées
   */
  static async getDashboardStats() {
    try {
      const [orders, products, users] = await Promise.all([
        this._getOrderStats(),
        this._getProductStats(),
        this._getUserStats()
      ]);

      return {
        overview: {
          totalRevenue: orders.totalRevenue,
          totalOrders: orders.totalOrders,
          totalProducts: products.totalProducts,
          totalUsers: users.totalUsers,
          monthlyRevenueGrowth: orders.monthlyGrowth,
          userGrowth: users.monthlyGrowth
        },
        recentOrders: orders.recentOrders,
        topProducts: products.topSelling,
        userActivity: users.recentActivity
      };
    } catch (err) {
      logger.error(`Erreur récupération stats dashboard: ${err.message}`);
      throw new ErrorResponse('Erreur lors de la récupération des statistiques', 500);
    }
  }

  /**
   * Génère un rapport de ventes personnalisé
   * @param {Date} startDate - Date de début
   * @param {Date} endDate - Date de fin
   * @param {String} granularity - daily/weekly/monthly
   * @returns {Promise<Object>} Rapport de ventes
   */
  static async getSalesReport(startDate, endDate, granularity = 'daily') {
    try {
      // Validation des dates
      if (!moment(startDate).isValid() || !moment(endDate).isValid()) {
        throw new ErrorResponse('Dates invalides', 400);
      }

      const matchStage = {
        $match: {
          createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
          paymentStatus: 'succeeded'
        }
      };

      const groupStage = this._getGroupStage(granularity);

      const report = await Order.aggregate([
        matchStage,
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product',
            foreignField: '_id',
            as: 'productDetails'
          }
        },
        { $unwind: '$productDetails' },
        groupStage,
        { $sort: { _id: 1 } }
      ]);

      return {
        report,
        meta: {
          startDate,
          endDate,
          granularity,
          generatedAt: new Date()
        }
      };
    } catch (err) {
      logger.error(`Erreur génération rapport: ${err.message}`);
      throw err;
    }
  }

  /**
   * Obtient l'activité en temps réel
   * @returns {Promise<Object>} Activité récente
   */
  static async getRealTimeActivity() {
    try {
      const [recentOrders, recentUsers] = await Promise.all([
        Order.find()
          .sort({ createdAt: -1 })
          .limit(5)
          .populate('user', 'name email'),
        
        User.find()
          .sort({ createdAt: -1 })
          .limit(5)
          .select('name email createdAt')
      ]);

      return {
        recentOrders,
        recentUsers,
        updatedAt: new Date()
      };
    } catch (err) {
      logger.error(`Erreur récupération activité: ${err.message}`);
      throw new ErrorResponse('Erreur activité temps réel', 500);
    }
  }

  // ============ Méthodes privées ============

  static async _getOrderStats() {
    const now = moment();
    const lastMonth = moment().subtract(1, 'month');

    const [total, monthly, recent] = await Promise.all([
      Order.aggregate([
        { $match: { paymentStatus: 'succeeded' } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
      ]),
      
      Order.aggregate([
        { 
          $match: { 
            createdAt: { $gte: lastMonth.toDate() },
            paymentStatus: 'succeeded'
          } 
        },
        { 
          $group: { 
            _id: { $month: '$createdAt' },
            total: { $sum: '$total' },
            count: { $sum: 1 } 
          } 
        }
      ]),
      
      Order.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name')
    ]);

    const growth = monthly.length > 1 ? 
      ((monthly[1].total - monthly[0].total) / monthly[0].total * 100).toFixed(2) : 0;

    return {
      totalRevenue: total[0]?.total || 0,
      totalOrders: total[0]?.count || 0,
      monthlyGrowth: growth,
      recentOrders: recent
    };
  }

  static async _getProductStats() {
    const [total, topSelling] = await Promise.all([
      Product.countDocuments(),
      
      Product.aggregate([
        { 
          $lookup: {
            from: 'orderitems',
            localField: '_id',
            foreignField: 'product',
            as: 'orders'
          }
        },
        {
          $project: {
            name: 1,
            price: 1,
            sold: { $size: '$orders' },
            revenue: { $multiply: ['$price', { $size: '$orders' }] }
          }
        },
        { $sort: { sold: -1 } },
        { $limit: 5 }
      ])
    ]);

    return {
      totalProducts: total,
      topSelling
    };
  }

  static async _getUserStats() {
    const now = moment();
    const lastMonth = moment().subtract(1, 'month');

    const [total, monthly, recent] = await Promise.all([
      User.countDocuments(),
      
      User.aggregate([
        { $match: { createdAt: { $gte: lastMonth.toDate() } } },
        { $group: { _id: { $month: '$createdAt' }, count: { $sum: 1 } } }
      ]),
      
      User.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name email createdAt lastLogin')
    ]);

    const growth = monthly.length > 1 ? 
      ((monthly[1].count - monthly[0].count) / monthly[0].count * 100).toFixed(2) : 0;

    return {
      totalUsers: total,
      monthlyGrowth: growth,
      recentActivity: recent
    };
  }

  static _getGroupStage(granularity) {
    const dateFormats = {
      daily: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      weekly: { $dateToString: { format: '%Y-%U', date: '$createdAt' } },
      monthly: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
    };

    return {
      $group: {
        _id: dateFormats[granularity],
        totalSales: { $sum: '$items.price' },
        totalQuantity: { $sum: '$items.quantity' },
        ordersCount: { $sum: 1 },
        products: {
          $push: {
            productId: '$productDetails._id',
            name: '$productDetails.name',
            quantity: '$items.quantity',
            revenue: { $multiply: ['$items.price', '$items.quantity'] }
          }
        }
      }
    };
  }
}

module.exports = StatsService;