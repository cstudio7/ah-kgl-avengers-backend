import crypto from 'crypto';
import models from '../models/index';
import readTime from '../helpers/readingTime';

const {
  article, User, bookmark, likes
} = models;
const attributes = ['title', 'body', 'description', 'slug', 'createdAt', 'updatedAt', 'ratings', 'categories', 'readTime', 'tagList'];

/**
 * This function handle the rating  array and return the average rating of
 * a certain rated article.
 *
 * @param {*} data The article that.
 * @returns {*} Average rating value.
 *
 */
const getAverageRating = (data) => {
  const { ratings } = data;
  const average = ratings === null ? 0
    : ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
  return Number(average.toFixed(2));
};

const articles = {
  /*
   * Creating an article.
   *
   * For directly publishing an article, status flag has to be passed
   * into the request body object otherwise the article will be in drafted.
   */
  createArticle: async (req, res) => {
    try {
      const {
        title, body, status, tagList
      } = req.body;
      const { id: author } = req.user;
      const flag = status === undefined ? 'draft' : status.toLowerCase();
      const tags = req.is('application/json') ? tagList : JSON.parse(tagList);
      const totalArticleReadTime = readTime(body);

      const slug = `${title
        .toLowerCase()
        .split(' ')
        .join('-')
        .substring(0, 40)}${crypto.randomBytes(5).toString('hex')}`;
      const description = body.substring(0, 100);

      const queryArticle = await article.create({
        title,
        body,
        author,
        slug,
        description,
        status: flag,
        tagList: tags,
        readTime: totalArticleReadTime,
      });
      return res.status(201).send({
        status: res.statusCode,
        article: {
          title: queryArticle.title,
          description: queryArticle.description,
          body: queryArticle.body,
          slug: queryArticle.slug,
          tags: [queryArticle.tagList],
          totalArticleReadTime,
        }
      });
    } catch (err) {
      if (err.message) {
        res.status(500).send({
          error: 'Something happened on the server'
        });
      }
    }
  },

  /*
   * updating a post based on its slug.
   *
   * For updating an article, status flag has to be passed
   * into the request body object otherwise the article will be in drafted.
   */
  updateArticle: async (req, res) => {
    try {
      const oldSlug = req.params.slug;
      const { title, body, tagList } = req.body;
      const slug = `${title
        .toLowerCase()
        .split(' ')
        .join('-')
        .substring(0, 20)}${crypto.randomBytes(5).toString('hex')}`;
      const description = body.substring(0, 100);
      const totalArticleReadTime = readTime(body);

      await article.update(
        {
          title,
          body,
          slug,
          description,
          tagList,
          readTime: totalArticleReadTime,
        },
        {
          where: { slug: oldSlug }
        }
      );
      const updateThisArticle = await article.findOne({ where: { slug } });
      if (!updateThisArticle) {
        return res.status(404).send({
          status: res.statusCode,
          errorMessage: 'Article not found, please create a new article instead'
        });
      }
      updateThisArticle.ratings = getAverageRating(updateThisArticle);
      return res.status(200).send({
        status: res.statusCode,
        article: {
          title: updateThisArticle.title,
          body: updateThisArticle.body,
          slug: updateThisArticle.slug,
          ratings: updateThisArticle.ratings,
          tagList: updateThisArticle.tagList,
        }
      });
    } catch (err) {
      if (err.message) {
        res.status(500).send({
          status: res.statusCode,
          errorMessage: 'No article to update, please create an article first'
        });
      }
    }
  },

  /*
   * Deleting a post based on its slug.
   *
   * For avoiding permanent deletion of the content from the database
   * we set the flag to the article that it is deleted.
   */
  deleteArticle: async (req, res) => {
    const { slug } = req.params;
    const row = await article.update({ deleted: 1 }, { where: { slug, deleted: 0 } });
    if (row[0] === 0) {
      return res.status(404).send({
        status: res.statusCode,
        message: 'No article found for this slug'
      });
    }
    return res.status(200).send({
      status: res.statusCode,
      message: 'Article deleted successfully'
    });
  },

  /*
   * Retrieving all the published articles based to the author
   * and the status of the article (Published).
   */
  getAllPublishedArticles: async (req, res) => {
    const { limit, offset } = req.query;
    try {
      const { id } = req.user;
      const authorInfo = await User.findOne({
        where: { id },
        attributes: ['username', 'bio', 'image', 'following']
      });
      const response = await article.findAll({
        where: {
          author: id,
          status: 'published',
          deleted: 0
        },
        attributes,
        limit,
        offset
      });

      response.forEach((element) => {
        element.ratings = getAverageRating(element);
        element.author = authorInfo;
      });
      return res.status(200).send({
        status: res.statusCode,
        articles: response,
        articlesCount: response.length
      });
    } catch (error) {
      throw error;
    }
  },

  /*
   * Retrieving all the published articles based to the author
   * and the status of the article (Draft).
   */
  getAllDraftArticles: async (req, res) => {
    const { limit, offset } = req.query;
    try {
      const { id } = req.user;
      const authorInfo = await User.findOne({
        where: { id },
        attributes: ['username', 'bio', 'image', 'following']
      });
      const response = await article.findAll({
        where: {
          author: id,
          status: 'draft',
          deleted: 0
        },
        attributes,
        limit,
        offset
      });

      response.forEach((element) => {
        element.ratings = getAverageRating(element);
        element.author = authorInfo;
      });
      return res.status(200).send({
        status: res.statusCode,
        articles: response,
        articlesCount: response.length
      });
    } catch (error) {
      throw error;
    }
  },

  /*
   * Construct user's feed
   * and the status of the article (Published).
   */
  getFeeds: async (req, res) => {
    const { limit, offset } = req.query;
    try {
      attributes.push('author');
      const allArticles = await article.findAll({
        where: { status: 'published', deleted: 0 },
        attributes,
        limit,
        offset
      });

      // eslint-disable-next-line no-restricted-syntax
      for (const iterator of allArticles) {
        const auth = User.findOne({
          where: { id: iterator.author },
          attributes: ['username', 'bio', 'image', 'following']
        });
        iterator.author = auth;
        iterator.ratings = getAverageRating(iterator);
      }

      return res.status(200).send({
        status: res.statusCode,
        articles: allArticles,
        articlesCount: allArticles.length
      });
    } catch (error) {
      throw error;
    }
  },

  /*
   * Viewing an article based on its slug.
   *
   * To view an article, status flag has to be passed
   * into params otherwise the article will be in drafted.
   */
  viewArticle: async (req, res) => {
    const { slug } = req.params;
    try {
      const oneArticle = await article.findOne({ where: { slug } });
      if (!oneArticle) {
        return res.status(404).send({
          status: res.statusCode,
          errorMessage: 'No article found, please create an article first'
        });
      }
      const findLikes = await likes.findAll({ where: { articleId: oneArticle.id, status: 'liked' } });
      const articlesAuthor = await User.findOne({ where: { id: oneArticle.author }, attributes: ['username', 'image'] });
      oneArticle.author = articlesAuthor;
      oneArticle.ratings = getAverageRating(oneArticle);
      return res.status(200).send({
        status: res.statusCode,
        article: {
          title: oneArticle.title,
          body: oneArticle.body,
          description: oneArticle.description,
          slug: oneArticle.slug,
          tagList: oneArticle.tagList,
          ratings: oneArticle.ratings,
          readTime: oneArticle.readTime,
          author: articlesAuthor,
          likes: findLikes.length,
        }
      });
    } catch (error) {
      if (error.message) {
        return res.status(500).send({
          status: res.statusCode,
          errorMessage: error.message
        });
      }
    }
  },

  /*
   * User should be able to rate an article.
   *
   * Only authenticated user will have access on this functionality
   * of rating an article.
   */
  rateArticle: async (req, res) => {
    const { slug } = req.params;
    const { rating } = req.body;
    try {
      const result = await article.findOne({ where: { slug } });
      if (!result) {
        return res.status(404).send({
          status: res.statusCode,
          errorMessage: 'Article not found',
        });
      }
      const ratings = result.ratings == null ? [Number(rating)]
        : result.ratings.concat(Number(rating));

      const updated = await article.update({ ratings }, {
        where: { slug },
        returning: true,
      });

      const data = updated[1][0].get();
      data.ratings = getAverageRating(data);

      delete data.id;
      delete data.deleted;
      return res.status(200).send({
        status: res.statusCode,
        data,
      });
    } catch (error) {
      return res.status(500).send({
        status: res.statusCode,
        error: 'Server failed to handle your request',
      });
    }
  },

  /* Bookmarking and article so that one can come back
  * and read it later.
  */

  createBookmark: async (req, res) => {
    try {
      const { slug } = req.params;
      const { id: userId } = req.user;
      if (!userId) {
        res.status(401).send({
          status: res.statusCode,
          errorMessage: 'Please first login to bookmark this article',
        });
      }
      const findArticle = await article.findOne({ where: { slug } });
      const findUser = await User.findOne({ where: { id: findArticle.author } });
      const checkExist = await bookmark.findOne({ where: { articleId: findArticle.id, userId } });
      if (checkExist) {
        return res.status(400).send({
          status: res.statusCode,
          errorMessage: 'You have already bookmarked this article',
        });
      }

      const createBookmark = await bookmark.create({
        userId, articleId: findArticle.id
      });
      if (createBookmark.articleId) {
        return res.status(200).send({
          status: res.statusCode,
          message: `Article from ${findUser.username} has been bookmarked`,
          data: {
            title: findArticle.title,
            body: findArticle.body,
            description: findArticle.description,
          }
        });
      }
      return res.status(404).send({
        status: res.statusCode,
        errorMessage: 'The article your trying to bookmark does not exit',
      });
    } catch (error) {
      if (error.message) {
        return res.status(500).send({
          status: res.statusCode,
          errorMessage: 'Something went wrong',
        });
      }
    }
  },

  /*
  * get all bookmarked articles return
  * them to the user.
  */

  getAllBookmarks: async (req, res) => {
    const { id: userId } = req.user;
    try {
      const bookmarkedArticles = [];
      const findBookmarks = await bookmark.findAll({ where: { userId } });

      // eslint-disable-next-line no-restricted-syntax
      for (const item of findBookmarks) {
        // eslint-disable-next-line no-await-in-loop
        const findBookmarkedArticle = await article.findOne({
          where: { id: item.articleId },
          attributes: ['title', 'slug', 'author'],
        });
        // eslint-disable-next-line no-await-in-loop
        const author = await User.findOne({
          where: { id: findBookmarkedArticle.author },
          attributes: ['username', 'image'],
        });
        findBookmarkedArticle.author = author;
        bookmarkedArticles.push(findBookmarkedArticle);
      }

      if (findBookmarks) {
        return res.status(200).send({
          status: res.statusCode,
          data: bookmarkedArticles
        });
      }
    } catch (error) {
      if (error.message) {
        res.status(500).send({
          status: res.statusCode,
          errorMessage: 'Something went wrong',
        });
      }
    }
  },

  /*
  * Retrieve a single bookmark
  * for a user.
  */
  getBookmarkedArticle: async (req, res) => {
    const { id: userId } = req.user;
    const { slug } = req.params;
    try {
      const findBookmarks = await bookmark.findOne({ where: { userId } });
      const findBookmarkedArticle = await article.findOne({
        where: { slug, id: findBookmarks.articleId },
        attributes: ['title', 'slug', 'author'],
      });
      const author = await User.findOne({
        where: { id: findBookmarkedArticle.author }, attributes: ['username', 'image'],
      });
      findBookmarkedArticle.author = author;
      if (findBookmarkedArticle === null) {
        res.status(400).send({
          status: res.statusCode,
          errorMessage: 'Article not found',
        });
      }
      res.status(200).send({
        status: res.statusCode,
        data: {
          findBookmarkedArticle
        }
      });
    } catch (error) {
      if (error.message) {
        res.status(500).send({
          status: res.statusCode,
          errorMessage: 'Something went wrong on the server',
        });
      }
    }
  },

  /*
  * delete an article when a user is done
  * a reading it.
  */
  deleteBookmark: async (req, res) => {
    const { slug } = req.params;
    const { id: userId } = req.user;
    try {
      const checkArticle = await article.findOne({ where: { slug } });
      const checkBookmark = await bookmark.destroy({
        where: { articleId: checkArticle.id, userId }
      });
      if (checkBookmark === 0) {
        res.status(401).send({
          status: res.statusCode,
          message: 'No bookmark to delete',
        });
      }
      if (checkBookmark) {
        res.status(200).send({
          status: res.statusCode,
          message: 'Bookmark cleared successfully',
        });
      }
    } catch (error) {
      if (error.message) {
        res.status(500).send({
          status: res.statusCode,
          message: 'Server Error',
        });
      }
    }
  }
};

export default articles;
