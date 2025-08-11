'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AuthModalProps {
  isOpen: boolean;
  onSuccess: (user: { phoneNumber: string; name: string; verified: boolean; token: string }) => void;
}

export default function AuthModal({ isOpen, onSuccess }: AuthModalProps) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [countdown, setCountdown] = useState(0);

  // Countdown timer for resend OTP
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Format phone number input
  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 10) {
      return cleaned.replace(/(\d{5})(\d{5})/, '$1 $2').trim();
    }
    return cleaned.slice(0, 10).replace(/(\d{5})(\d{5})/, '$1 $2');
  };

  // Format OTP input
  const formatOTP = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 6) {
      return cleaned.replace(/(\d{3})(\d{3})/, '$1 $2').trim();
    }
    return cleaned.slice(0, 6).replace(/(\d{3})(\d{3})/, '$1 $2');
  };

  const sendOTP = async () => {
    if (!phoneNumber.trim()) {
      setError('Please enter your phone number');
      return;
    }

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: cleanPhone })
      });

      const data = await response.json();

      if (data.success) {
        setSuccessMessage('OTP sent to your WhatsApp! Check your messages.');
        setStep('otp');
        setCountdown(30); // 30 seconds before allowing resend
      } else {
        setError(data.error || 'Failed to send OTP');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (!otp.trim()) {
      setError('Please enter the OTP');
      return;
    }

    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    const cleanOtp = otp.replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }

    if (name.trim().length < 2) {
      setError('Please enter a valid name (minimum 2 characters)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phoneNumber: phoneNumber.replace(/\D/g, ''), 
          otp: cleanOtp,
          name: name.trim()
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccessMessage('Verification successful! Welcome to Maninfini.');
        
        // Store auth data in localStorage
        const authData = {
          phoneNumber: data.user.phoneNumber,
          name: data.user.name,
          verified: true,
          token: data.token,
          timestamp: Date.now()
        };
        
        localStorage.setItem('maninfini_auth', JSON.stringify(authData));
        
        // Call success callback
        setTimeout(() => {
          onSuccess({
            phoneNumber: data.user.phoneNumber,
            name: data.user.name,
            verified: true,
            token: data.token
          });
        }, 1500);
      } else {
        setError(data.error || 'Invalid OTP');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Maninfini</h2>
          <p className="text-gray-600 text-sm">
            {step === 'phone' 
              ? 'Enter your phone number to get started with WhatsApp verification'
              : 'Enter the OTP sent to your WhatsApp and your name'
            }
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-green-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-green-800">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.732 18.5c.77.833 1.732 2.5 1.732 2.5z" />
              </svg>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        {/* Phone Number Step */}
        {step === 'phone' && (
          <div className="space-y-6">
            <div>
              <Label htmlFor="phone" className="text-sm font-medium text-gray-700 mb-2 block">
                Phone Number
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-mono">
                  +91
                </span>
                <Input
                  id="phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                  placeholder="98765 43210"
                  className="pl-12 h-12 text-lg font-mono tracking-wider"
                  maxLength={11} // 5 + space + 5
                  autoFocus
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                We'll send an OTP to this number via WhatsApp
              </p>
            </div>

            <Button 
              onClick={sendOTP}
              disabled={loading || !phoneNumber.trim()}
              className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-xl"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Sending OTP...
                </div>
              ) : (
                'Send OTP via WhatsApp'
              )}
            </Button>
          </div>
        )}

        {/* OTP Verification Step */}
        {step === 'otp' && (
          <div className="space-y-6">
            <div>
              <Label htmlFor="name" className="text-sm font-medium text-gray-700 mb-2 block">
                Your Name
              </Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                className="h-12 text-lg"
                autoFocus
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="otp" className="text-sm font-medium text-gray-700">
                  OTP from WhatsApp
                </Label>
                <span className="text-xs text-gray-500">
                  Sent to +91 {phoneNumber}
                </span>
              </div>
              <Input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(formatOTP(e.target.value))}
                placeholder="123 456"
                className="h-12 text-lg font-mono tracking-[0.5em] text-center"
                maxLength={7} // 3 + space + 3
              />
            </div>

            <div className="flex space-x-3">
              <Button 
                variant="outline"
                onClick={() => {
                  setStep('phone');
                  setOtp('');
                  setName('');
                  setError('');
                  setSuccessMessage('');
                }}
                className="flex-1 h-12 border-gray-300"
              >
                Change Number
              </Button>
              
              <Button 
                onClick={verifyOTP}
                disabled={loading || !otp.trim() || !name.trim()}
                className="flex-1 h-12 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-xl"
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Verifying...
                  </div>
                ) : (
                  'Verify & Continue'
                )}
              </Button>
            </div>

            {/* Resend OTP */}
            <div className="text-center">
              <button
                onClick={sendOTP}
                disabled={countdown > 0 || loading}
                className={`text-sm ${
                  countdown > 0 
                    ? 'text-gray-400 cursor-not-allowed' 
                    : 'text-orange-600 hover:text-orange-700 hover:underline'
                }`}
              >
                {countdown > 0 
                  ? `Resend OTP in ${countdown}s`
                  : 'Didn\'t receive OTP? Resend'
                }
              </button>
            </div>
          </div>
        )}

        {/* WhatsApp Icon/Branding */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <div className="flex items-center justify-center text-xs text-gray-500">
            <svg className="w-4 h-4 mr-2 text-green-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
            </svg>
            Secured with WhatsApp verification
          </div>
        </div>
      </div>
    </div>
  );
}