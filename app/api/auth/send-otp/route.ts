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
    const { phoneNumber } = await request.json();
    
    if (!phoneNumber) {
      return NextResponse.json({ 
        success: false, 
        error: 'Phone number is required' 
      }, { status: 400 });
    }
    
    // Clean phone number (remove spaces, dashes, etc.)
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    // Validate phone number (should be 10 digits for Indian numbers)
    if (cleanPhone.length !== 10) {
      return NextResponse.json({ 
        success: false, 
        error: 'Please enter a valid 10-digit phone number' 
      }, { status: 400 });
    }
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP in memory/session (in production, use Redis or database)
    // For now, we'll use a simple in-memory store
    if (!global.otpStore) {
      global.otpStore = new Map<string, OTPData>();
    }
    
    // Store OTP with expiry (5 minutes)
    global.otpStore.set(cleanPhone, {
      otp,
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      attempts: 0
    });
    
    // Format phone for WhatsApp API (add country code)
    const formattedPhone = `91${cleanPhone}`;
    
    // Send OTP via Blue Tick WhatsApp API using the template
    const formData = new FormData();
    formData.append('userid', 'Maninfinwa');
    formData.append('msg', `${otp} is your verification code. For your security, do not share this code.`);
    formData.append('wabaNumber', '918310516955');
    formData.append('output', 'json');
    formData.append('mobile', formattedPhone);
    formData.append('sendMethod', 'quick');
    formData.append('msgType', 'text');
    formData.append('templateName', 'otp_template');
    
    const whatsappResponse = await fetch('http://theultimate.io/WAApi/send', {
      method: 'POST',
      headers: {
        'apikey': '43880477afc831236063dbad1c74097417b28f4b',
        'Cookie': 'SERVERID=webC1'
      },
      body: formData
    });
    
    const whatsappResult = await whatsappResponse.json();
    
    if (whatsappResponse.ok && whatsappResult.status === 'success') {
      return NextResponse.json({ 
        success: true, 
        message: 'OTP sent successfully to your WhatsApp',
        phoneNumber: cleanPhone
      });
    } else {
      console.error('WhatsApp API Error:', whatsappResult);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to send OTP. Please try again.' 
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Send OTP Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
