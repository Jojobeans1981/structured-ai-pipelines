import { NextAuthOptions } from 'next-auth';
import GitLabProvider from 'next-auth/providers/gitlab';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/src/lib/prisma';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  providers: [
    GitLabProvider({
      clientId: process.env.GITLAB_CLIENT_ID!,
      clientSecret: process.env.GITLAB_CLIENT_SECRET!,
      authorization: {
        url: `${process.env.GITLAB_BASE_URL}/oauth/authorize`,
        params: { scope: 'read_user' },
      },
      token: `${process.env.GITLAB_BASE_URL}/oauth/token`,
      userinfo: `${process.env.GITLAB_BASE_URL}/api/v4/user`,
      checks: ['state'],
    }),
  ],
  session: {
    strategy: 'database',
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
};
