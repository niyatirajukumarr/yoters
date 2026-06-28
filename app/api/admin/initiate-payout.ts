import { NextRequest, NextResponse } from 'next/server'

const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET
const RAZORPAY_ACCOUNT_ID = process.env.RAZORPAY_ACCOUNT_ID

async function createRazorpayPayout(amount: number, upiId: string, vendorName: string) {
  try {
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')

    const response = await fetch('https://api.razorpay.com/v1/payouts', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        account_number: RAZORPAY_ACCOUNT_ID,
        amount: Math.round(amount * 100), // Convert to paise
        currency: 'INR',
        mode: 'UPI',
        purpose: 'refund',
        vpa: upiId,
        description: `Payout to ${vendorName}`,
        notes: {
          vendor: vendorName,
          settlement_date: new Date().toISOString()
        }
      })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error?.description || data.description || 'Razorpay payout failed')
    }

    return data
  } catch (error) {
    console.error('Razorpay API error:', error)
    throw error
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { vendorName, upiId, amount } = body

    // Validation
    if (!vendorName || !upiId || !amount) {
      return NextResponse.json({ error: 'Missing required fields: vendorName, upiId, amount' }, { status: 400 })
    }

    if (amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    // Create payout via Razorpay
    const payout = await createRazorpayPayout(amount, upiId, vendorName)

    return NextResponse.json({
      success: true,
      payout_id: payout.id,
      status: payout.status,
      amount: amount,
      message: `✅ ₹${amount} payout initiated to ${upiId}`
    }, { status: 200 })
  } catch (error) {
    console.error('Payout API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
