import { NextRequest, NextResponse } from 'next/server';

// Define types for OTP store
interface OTPData {
  otp: string;
  expires: number;
  attempts: number;
}

// Extend global interface for TypeScript
declare global {
  var otpStore: Map<string, OTPData> | undefined;
}

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber, otp, name } = await request.json();
    
    if (!phoneNumber || !otp || !name) {
      return NextResponse.json({ 
        success: false, 
        error: 'Phone number, OTP, and name are required' 
      }, { status: 400 });
    }
    
    // Clean phone number
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    // Clean OTP (remove spaces)
    const cleanOtp = otp.replace(/\s/g, '');
    
    // Validate name (minimum 2 characters)
    if (name.trim().length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'Please enter a valid name (minimum 2 characters)' 
      }, { status: 400 });
    }
    
    // Check if OTP store exists
    if (!global.otpStore) {
      return NextResponse.json({ 
        success: false, 
        error: 'No OTP found. Please request a new OTP.' 
      }, { status: 400 });
    }
    
    // Get stored OTP data
    const storedData = global.otpStore.get(cleanPhone);
    
    if (!storedData) {
      return NextResponse.json({ 
        success: false, 
        error: 'No OTP found for this phone number. Please request a new OTP.' 
      }, { status: 400 });
    }
    
    // Check if OTP has expired
    if (Date.now() > storedData.expires) {
      global.otpStore.delete(cleanPhone);
      return NextResponse.json({ 
        success: false, 
        error: 'OTP has expired. Please request a new OTP.' 
      }, { status: 400 });
    }
    
    // Check attempts (max 3 attempts)
    if (storedData.attempts >= 3) {
      global.otpStore.delete(cleanPhone);
      return NextResponse.json({ 
        success: false, 
        error: 'Too many failed attempts. Please request a new OTP.' 
      }, { status: 400 });
    }
    
    // Verify OTP
    if (cleanOtp !== storedData.otp) {
      // Increment attempts
      storedData.attempts += 1;
      global.otpStore.set(cleanPhone, storedData);
      
      return NextResponse.json({ 
        success: false, 
        error: `Invalid OTP. ${3 - storedData.attempts} attempts remaining.` 
      }, { status: 400 });
    }
    
    // OTP is valid - clean up
    global.otpStore.delete(cleanPhone);
    
    // Create user session/token (you can implement JWT here)
    const userToken = Buffer.from(JSON.stringify({
      phoneNumber: cleanPhone,
      name: name.trim(),
      verified: true,
      timestamp: Date.now()
    })).toString('base64');
    
    // In production, you might want to store user data in a database
    console.log(`User verified: ${name} (${cleanPhone})`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Phone number verified successfully!',
      user: {
        phoneNumber: cleanPhone,
        name: name.trim(),
        verified: true
      },
      token: userToken
    });
    
  } catch (error) {
    console.error('Verify OTP Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}