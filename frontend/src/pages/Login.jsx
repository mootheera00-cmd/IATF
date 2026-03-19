// frontend/src/pages/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, Eye, EyeOff, Lock, Mail } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      setLoading(true);
      await login(employeeCode, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
      
      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-8 relative z-10">
        {/* Left side - Branding */}
        <div className="hidden md:flex flex-col justify-center space-y-8">
          <div>
            <div className="inline-flex items-center justify-center w-24 h-24 bg-white rounded-2xl mb-3 shadow-2xl mx-auto">
              <span className="text-red-600 text-4xl font-bold leading-none">NSK</span>
            </div>
            <h1 className="text-2xl font-black text-white mb-4 leading-tight">NSK APTC : IATF 16949</h1>
            <p className="text-xl text-purple-200 mb-8 leading-relaxed">
              Professional Document Control & Change Management System
            </p>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-300">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Automated approval workflows</span>
              </div>
              <div className="flex items-center gap-3 text-gray-300">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Full audit trail & compliance</span>
              </div>
              <div className="flex items-center gap-3 text-gray-300">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Role-based access control</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Login Form */}
        <div className="flex flex-col justify-center">
          <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-10 space-y-8">
            <div className="text-center md:text-left">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome.</h2>
              <p className="text-gray-600">Sign in to your account to continue</p>
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 flex gap-3">
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                <p className="text-red-800 text-sm font-medium">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Master ID Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  Master ID
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-4 text-gray-400" size={20} />
                  <input
                    type="text"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    placeholder="ADMIN001"
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100 transition-all"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  <span>Password </span>
                  <span className="text-gray-400 font-light">(Employee Code)</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-4 text-gray-400" size={20} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-12 pr-12 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-600 focus:ring-4 focus:ring-purple-100 transition-all"
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-xl font-bold hover:shadow-lg hover:shadow-purple-500/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed mt-8"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Signing in...
                  </div>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

          </div>
        </div>
      </div>
    </div>
  );
}
