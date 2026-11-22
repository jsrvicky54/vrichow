/** An error whose message is safe and friendly enough to show to the person. */
class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserError';
    this.isUserError = true;
  }
}

module.exports = { UserError };
