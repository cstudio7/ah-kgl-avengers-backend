import models from '../models/index';
import subscribe from '../helpers/subscribe';

const { User, article, subscribers } = models;
const { Op } = models.Sequelize;

const unsubscribe = {
  unsubscribe: async (req, res) => {
    const { slugOrUsername } = req.params;
    const { id: userId } = req.user;
    const user = await User.findOne({
      where: { username: slugOrUsername }
    });
    const subscribedarticle = await article.findOne({
      where: { slug: slugOrUsername }
    });
    try {
      const id = (subscribedarticle) ? subscribedarticle.id : user.id;
      const subscriber = await subscribers.findOne({
        where: {
          [Op.or]: [{ authorId: id }, { articleId: id }]
        },
        attribute: { subscribers }
      });
      if (!subscriber.subscribers.includes(userId)) {
        return res.status(400).send({
          status: res.statusCode,
          message: 'you are not a subscriber'
        });
      }
      subscribe(userId, id);
      return res.status(200).send({
        status: res.statusCode,
        message: 'successfully unsubscribed'
      });
    } catch (er) {
      return res.status(400).send({
        status: res.statusCode,
        message: 'ressource not found'
      });
    }
  }
};

export default unsubscribe;
