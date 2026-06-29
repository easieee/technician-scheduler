import React from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useGoogleLogin } from '@react-oauth/google';
import { format, isToday, isYesterday, isTomorrow } from 'date-fns';
import {
  ChevronLeft, ChevronRight, Calendar,
  UserPlus, Plus, LogOut
} from 'lucide-react';
import toast from 'react-hot-toast';

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function getDateLabel(date) {
  if (isToday(date))     return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isTomorrow(date))  return 'Tomorrow';
  return format(date, 'MMM d');
}

export default function TopBar({ calendarDate, onPrev, onNext, onToday, onAddTech, onCreateJob }) {
  const { user, technicians, jobOrders, login, logout, canManageData } = useApp();

  const handleLogin = useGoogleLogin({
    scope: 'openid profile email https://www.googleapis.com/auth/spreadsheets',
    onSuccess: async (tokenResponse) => {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        });
        if (!res.ok) throw new Error('Could not fetch user info');
        const info = await res.json();
        await login(
          { name: info.name, email: info.email, picture: info.picture },
          tokenResponse.access_token
        );
      } catch (err) {
        toast.error('Sign-in failed: ' + err.message);
      }
    },
    onError: () => toast.error('Google sign-in was cancelled or failed.')
  });

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayJobs = jobOrders.filter(j => j.date === todayStr);
  const scheduledIds = new Set(todayJobs.flatMap(j => j.technicianIds || []));
  const scheduledCount = [...scheduledIds].filter(id => technicians.some(t => t.id === id)).length;
  const availableCount = technicians.length - scheduledCount;

  return (
    <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-4 shadow-sm">

      {/* Stats */}
      <div className="flex items-center gap-8 shrink-0">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 leading-none mb-0.5">
            Scheduled Today
          </p>
          <p className="text-2xl font-bold text-slate-800 leading-none">
            {scheduledCount}
            <span className="text-sm font-normal text-slate-400 ml-1">/ {technicians.length} techs</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-none mb-0.5">
            Available Now
          </p>
          <p className="text-2xl font-bold text-slate-400 leading-none">
            {availableCount}
            <span className="text-sm font-normal text-slate-400 ml-1">techs</span>
          </p>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* Calendar navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            title="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Date label — click to jump back to today */}
          <button
            onClick={onToday}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors min-w-[130px] justify-center"
            title="Go to today"
          >
            <Calendar className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <span className={`text-sm font-semibold ${
              isToday(calendarDate) ? 'text-blue-600' : 'text-slate-700'
            }`}>
              {getDateLabel(calendarDate)}
            </span>
          </button>

          <button
            onClick={onNext}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            title="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Actions */}
        {canManageData ? (
          <>
            <button
              onClick={onAddTech}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors font-medium"
            >
              <UserPlus className="h-3.5 w-3.5" />
              + Add Tech
            </button>

            <button
              onClick={onCreateJob}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-blue-100"
            >
              <Plus className="h-4 w-4" />
              Create Job Order
            </button>
          </>
        ) : null}

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* User / Auth */}
        {user ? (
          <>
            {user.picture && (
              <img src={user.picture} alt={user.name} className="h-8 w-8 rounded-full border-2 border-slate-200" title={user.name} />
            )}
            <button
              onClick={logout}
              title="Logout"
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            onClick={handleLogin}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <GoogleIcon />
            Sign in
          </button>
        )}
      </div>
    </div>
  );
}
