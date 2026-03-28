import { redirect } from 'next/navigation';

// Login page disabled — redirect to home until OAuth flow is verified end-to-end
export default function LoginPage() {
  redirect('/');
}
