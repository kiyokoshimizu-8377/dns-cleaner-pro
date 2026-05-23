export type JwtPayload = {
  sub: string;
  username: string;
  email: string;
  role: string;
};

export type SafeUser = {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
};
