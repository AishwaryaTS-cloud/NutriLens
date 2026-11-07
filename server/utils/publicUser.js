/** The only user fields that ever leave the server. Never includes the password hash. */
export function toPublicUser(user) {
  return {
    id: String(user.id ?? user._id),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}
