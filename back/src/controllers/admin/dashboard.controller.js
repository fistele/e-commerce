const Order = require('../../models/Order');
const Product = require('../../models/Product');
const User = require('../../models/User');
const logger = require('../../utils/logger');
const moment = require('moment');

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private/Admin
exports.getDashboardStats = async (req, res) => {
  try {
    // Calcul en parallèle pour optimiser les performances
    const [
      totalOrders,
      totalProducts,
      totalUsers,
      totalRevenue,
      recentOrders,
      popularProducts,
      salesData,
      userActivity
    ] = await Promise.all([
      // Statistiques de base
      Order.countDocuments(),
      Product.countDocuments(),
      User.countDocuments(),
      
      // Chiffre d'affaires total
      Order.aggregate([
        { $match: { status: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      
      // 10 dernières commandes
      Order.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('user', 'firstName lastName email'),
      
      // Produits les plus vendus
      Order.aggregate([
        { $unwind: '$items' },
        { 
          $group: { 
            _id: '$items.product', 
            totalSold: { $sum: '$items.quantity' } 
          } 
        },
        { $sort: { totalSold: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $project: {
            _id: 0,
            productId: '$_id',
            name: '$product.name',
            image: '$product.images.0',
            totalSold: 1
          }
        }
      ]),
      
      // Données de vente pour les 12 derniers mois
      Order.aggregate([
        {
          $match: {
            createdAt: {
              $gte: moment().subtract(12, 'months').toDate()
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            totalSales: { $sum: '$totalAmount' },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1 }
        },
        {
          $project: {
            _id: 0,
            month: {
              $let: {
                vars: {
                  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                },
                in: {
                  $arrayElemAt: ['$$months', { $subtract: ['$_id.month', 1] }]
                }
              }
            },
            year: '$_id.year',
            totalSales: 1,
            count: 1
          }
        }
      ]),
      
      // Activité utilisateur
      User.aggregate([
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } },
        { $limit: 30 }
      ])
    ]);

    // Formatage des données
    const stats = {
      totals: {
        orders: totalOrders,
        products: totalProducts,
        users: totalUsers,
        revenue: totalRevenue[0]?.total || 0
      },
      recentOrders,
      popularProducts,
      salesData,
      userActivity
    };

    logger.info(`Dashboard stats fetched by admin ${req.user._id}`);
    res.json({ success: true, data: stats });

  } catch (error) {
    logger.error(`Dashboard error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la récupération des statistiques' 
    });
  }
};

// @desc    Get real-time activity
// @route   GET /api/admin/activity
// @access  Private/Admin
exports.getRealTimeActivity = async (req, res) => {
  try {
    const [recentOrders, newUsers] = await Promise.all([
      Order.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('totalAmount status createdAt')
        .lean(),
      
      User.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('firstName lastName createdAt')
        .lean()
    ]);

    res.json({
      success: true,
      data: {
        orders: recentOrders.map(order => ({
          ...order,
          createdAt: moment(order.createdAt).fromNow()
        })),
        users: newUsers.map(user => ({
          ...user,
          createdAt: moment(user.createdAt).fromNow()
        }))
      }
    });

  } catch (error) {
    logger.error(`Real-time activity error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur' 
    });
  }
};

// @desc    Get sales report by period
// @route   POST /api/admin/sales-report
// @access  Private/Admin
exports.getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.body;

    // Validation des dates
    if (!moment(startDate).isValid() || !moment(endDate).isValid()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Format de date invalide' 
      });
    }

    // Configuration de l'agrégation en fonction de la période
    let dateFormat, groupId;
    switch (groupBy) {
      case 'month':
        dateFormat = '%Y-%m';
        groupId = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        };
        break;
      case 'year':
        dateFormat = '%Y';
        groupId = { year: { $year: '$createdAt' } };
        break;
      default: // daily
        dateFormat = '%Y-%m-%d';
        groupId = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
    }

    const report = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          },
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: groupId,
          totalSales: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
          averageOrder: { $avg: '$totalAmount' }
        }
      },
      {
        $sort: { '_id': 1 }
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateToString: { 
              format: dateFormat, 
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: '$_id.day'
                }
              }
            }
          },
          totalSales: 1,
          orderCount: 1,
          averageOrder: { $round: ['$averageOrder', 2] }
        }
      }
    ]);

    res.json({ success: true, data: report });

  } catch (error) {
    logger.error(`Sales report error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la génération du rapport' 
    });
  }
};