import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import sgMail from '@sendgrid/mail';
import models from '../models';
import mailer from '../config/verificationMail';

dotenv.config();

const { User, BlacklistTokens } = models;

/**
 * @description User Controller class
 */
class Users {
  /**
   * Adds two numbers together.
   * @param {Object} req .
   * @param {Object} res The User Object.
   * @returns {Object} The informations of User created.
   */
  static async createUserLocal(req, res) {
    const { email, username, password: hash } = req.body;

    try {
      const user = await User.create({ email: email.trim(), username: username.trim(), hash });
      if (!user) {
        return res.status(500).send({
          status: 500,
          errorMessage: 'some Error occured'
        });
      }

      mailer.sentActivationMail({ name: username, id: user.id, email });

      return res.status(201).json({
        status: 201,
        message: 'user created',
        user: {
          email: user.email,
          username: user.username
        }
      });
    } catch (e) {
      return e;
    }
  }

  /**
   *
   * @param {*} req request object.
   * @param {*} res response object.
   * @returns {Object} returns the User Object
   */
  static async activateUserAccount(req, res) {
    const { id } = req.params;
    await User.update({ activated: 1 }, { where: { id } });
    return res.status(201).send({
      status: res.statusCode,
      message: 'Your account updated successfuly'
    });
  }

  /**
   * @param {Object} req
   * @param {Object} res
   * @returns {Object} returns the User Object
   */
  static async signinLocal(req, res) {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (user.activated === 0) {
      return res.status(400).send({
        errorMessage: `The account with email ${email} is not activated`
      });
    }
    const { salt, hash, id } = user;
    const hashInputpwd = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

    if (hash !== hashInputpwd) {
      return res.status(400).send({
        status: 400,
        errorMessage: 'The password is not correct'
      });
    }

    if (hash === hashInputpwd) {
      const token = jwt.sign({ id, email, exp: Date.now() / 1000 + 60 * 60 }, process.env.SECRET);
      return res.status(200).json({
        status: 200,
        user: {
          email: user.email,
          token,
          username: user.username,
          bio: user.bio,
          image: user.image
        }
      });
    }
  }

  /**
   * @param {Object} req
   * @param {Object} res
   * @returns {Object} Returns the User Object or the error Object
   */
  static async createUserSocial(req, res) {
    const {
      id, displayName, emails, provider
    } = req.user;
    try {
      const existingUser = await User.findOne({ where: { username: displayName } && { provider } });
      if (existingUser) {
        const token = jwt.sign(
          {
            id,
            emails,
            exp: Date.now() / 1000 + 60 * 60
          },
          process.env.SECRET
        );
        return res.status(200).send({
          status: res.statusCode,
          token,
          data: {
            id: existingUser.id,
            username: existingUser.username,
            email: existingUser.email,
            provider: existingUser.provider
          }
        });
      }

      const user = new User({
        provider,
        email: emails[0].value,
        username: displayName
      });
      const newUser = await user.save();

      mailer.sentActivationMail({
        name: displayName,
        id: newUser.id,
        email: newUser.email
      });

      const token = jwt.sign(
        {
          id,
          emails,
          exp: Date.now() / 1000 + 60 * 60
        },
        process.env.SECRET
      );
      res.status(201).send({
        status: res.statusCode,
        token,
        data: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          provider: newUser.provider
        }
      });
    } catch (error) {
      const existingUser = await User.findOne({ where: { username: displayName } });
      if (error.errors[0].type) {
        res.status(422).send({
          status: res.statusCode,
          message: `${error.errors[0].value} already exits, please login with ${
            existingUser.provider
          } `
        });
      }
    }
  }

  /**
   * reset user password
   * @param {object} req
   * @param {object} res
   * @returns {object} res
   */
  static async resetPassword(req, res) {
    // check if email exists in the database
    const { email } = req.body;
    const result = await User.findAll({
      where: {
        email
      }
    });
    if (result.length === 0) {
      return res.status(404).send({
        status: res.statusCode,
        message: 'email not found'
      });
    }

    // create a JWT token
    const token = await jwt.sign({ email }, process.env.SECRET, { expiresIn: '2h' });
    // send email using sendgrid
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const msg = {
      to: email,
      from: 'info@authorhaven.com',
      subject: 'Sending with SendGrid is Fun',
      html: `
      <p>
       You are receiving this email because you requested a password reset for your authorhaven account,<br>
       Click on the reset link bellow to reset or ignore this message, if you didn't make password reset request<br>
       <a href='http://localhost:3000/api/v1/update_password/${token}' target='_blank'>Reset Password</a>
      </p>
     `
    };

    sgMail.send(msg).then(() => res.status(200).send({
      status: res.statusCode,
      message: 'Reset email sent! check your email'
    }));
  }

  /**
   * update user password
   * @param {object} req
   * @param {object} res
   * @returns {object} res
   */
  static async updatePassword(req, res) {
    // verify token
    const { token } = req.params;
    const { password, password2 } = req.body;
    if (password !== password2) {
      return res.status(400).send({
        status: res.statusCode,
        message: 'password not matching'
      });
    }

    try {
      jwt.verify(token, process.env.SECRET);
    } catch (err) {
      return res.status(404).send({
        status: res.statusCode,
        message: `${err.message}, go to reset again`
      });
    }

    const { email } = jwt.verify(token, process.env.SECRET);

    // update password
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    await User.update(
      {
        salt,
        hash
      },
      {
        where: {
          email
        }
      }
    );
    return res.status(200).send({
      status: res.statusCode,
      message: 'Password successfully updated'
    });
  }

  /**
   *
   * @param {object} req
   * @param {object} res
   * @param {object} next
   * @returns {object} res
   */
  static async logout(req, res, next) {
    const { exp } = req.user;
    const token = req.headers.authorization.split(' ')[1];
    BlacklistTokens.create({ token, expires: new Date(exp * 1000) })
      .then(() => res.status(200).json({
        status: res.statusCode,
        message: 'user logged out'
      }))
      .catch(err => next(err));
  }
}

export default Users;
