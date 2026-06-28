'use client'

export const dynamic = 'force-dynamic'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, Suspense, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { generateSlug } from '@/lib/utils/slug'
import Script from 'next/script'

interface RazorpayWindow extends Window {
  Razorpay?: any
}

function PaymentPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')
  const amount = searchParams.get('amount')
  const name = searchParams.get('name')

  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [sdkLoaded, setSdkLoaded] = useState(false)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const razorpayOrderIdRef = useRef<string | null>(null)
  const cafeSlugRef = useRef<string | null>(null)

  // Get cafeteria slug from order
  const getCafeSlug = async (orderId: string) => {
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('cafeteria_id')
        .eq('id', orderId)
        .single()

      if (order?.cafeteria_id) {
        const { data: cafe } = await supabase
          .from('cafeterias')
          .select('name')
          .eq('id', order.cafeteria_id)
          .single()

        if (cafe) {
          const slug = generateSlug(cafe.name)
          cafeSlugRef.current = slug
          return slug
        }
      }
      return null
    } catch (err) {
      console.error('Error getting cafe slug:', err)
      return null
    }
  }

  // Initialize payment on mount
  useEffect(() => {
    const initializePayment = async () => {
      if (!orderId || !amount || !name) {
        setError('Missing payment information')
        setLoading(false)
        return
      }

      try {
        console.log('[Payment] Initializing payment for order:', orderId)

        // Get user email from Supabase session
        const { data: { session } } = await supabase.auth.getSession()
        const email = session?.user?.email || `student-${orderId}@yoters.local`

        // Create Razorpay order
        const response = await fetch('/api/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            amount: parseInt(amount),
            studentEmail: email,
            studentPhone: '9999999999',
            studentName: name,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to create payment order')
        }

        const data = await response.json()
        console.log('[Payment] Razorpay order created:', data.razorpayOrderId)
        razorpayOrderIdRef.current = data.razorpayOrderId

        setLoading(false)
        setProcessing(true)

        // Start polling for payment confirmation
        startPaymentPolling(orderId)
      } catch (err: any) {
        console.error('[Payment] Initialization error:', err)
        setError(err.message || 'Failed to initialize payment')
        setLoading(false)
      }
    }

    initializePayment()

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [orderId, amount, name])

  // When SDK is loaded AND order is ready, open the modal
  useEffect(() => {
    if (sdkLoaded && processing && razorpayOrderIdRef.current) {
      console.log('[Payment] Both SDK and order ready, opening modal')
      openRazorpayModal()
    }
  }, [sdkLoaded, processing])

  // Poll for payment confirmation
  const startPaymentPolling = (orderId: string) => {
    let pollCount = 0
    const maxPolls = 150

    pollIntervalRef.current = setInterval(async () => {
      pollCount++

      try {
        const { data: order } = await supabase
          .from('orders')
          .select('payment_status')
          .eq('id', orderId)
          .single()

        if (order && order.payment_status === 'paid') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          setProcessing(false)
          setPaymentConfirmed(true)

          // Get cafeteria slug for redirect
          const slug = cafeSlugRef.current || await getCafeSlug(orderId)

          if (window.opener) {
            window.opener.postMessage({ type: 'PAYMENT_SUCCESS', orderId }, '*')
          }
          setTimeout(() => {
            if (window.opener) window.close()
            else router.push(slug ? `/mobile/order/${slug}` : `/browse`)
          }, 4000)
          return
        }
      } catch (err) {
        console.error('[Payment] Polling error:', err)
      }

      if (pollCount >= maxPolls) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        setProcessing(false)
        setError('Payment verification timeout. Please check your order status.')
      }
    }, 2000)
  }

  // Open Razorpay modal
  const openRazorpayModal = async () => {
    try {
      const Razorpay = (window as RazorpayWindow).Razorpay

      if (!Razorpay) {
        console.error('[Payment] Razorpay SDK not available')
        setError('Payment SDK failed to load')
        setProcessing(false)
        return
      }

      if (!razorpayOrderIdRef.current) {
        console.error('[Payment] No Razorpay order ID')
        setError('Payment order not created')
        setProcessing(false)
        return
      }

      console.log('[Payment] Creating Razorpay instance')

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id: razorpayOrderIdRef.current,
        name: 'Yoters',
        description: 'Food Order',
        prefill: {
          name: name || 'Student',
          email: `student@yoters.local`,
          contact: '9999999999',
        },
        theme: {
          color: '#E8334A',
        },
        // UPI Only
        method: {
          upi: true,
          card: false,
          netbanking: false,
          wallet: false,
        },
        handler: async function (response: any) {
          // Mark order as paid via server-side API (bypasses RLS), save payment ID for refunds
          await fetch('/api/confirm-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              razorpayPaymentId: response.razorpay_payment_id,
            }),
          })

          // Get cafeteria slug for redirect
          const slug = cafeSlugRef.current || await getCafeSlug(orderId)

          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          setProcessing(false)
          setPaymentConfirmed(true)
          if (window.opener) {
            window.opener.postMessage({ type: 'PAYMENT_SUCCESS', orderId }, '*')
            setTimeout(() => window.close(), 3000)
          } else {
            setTimeout(() => router.push(slug ? `/mobile/order/${slug}` : `/browse`), 3000)
          }
        },
        modal: {
          ondismiss: function () {
            console.log('[Payment] Modal closed/failed')
            setProcessing(false)
            setError('Payment failed or cancelled.')
            if (window.opener) {
              window.opener.postMessage({ type: 'PAYMENT_FAILED', orderId }, '*')
            }
          },
        },
      }

      const razorpayInstance = new Razorpay(options)
      console.log('[Payment] Opening Razorpay modal')
      razorpayInstance.open()
    } catch (err: any) {
      console.error('[Payment] Error opening modal:', err)
      setError(`Payment error: ${err.message}`)
      setProcessing(false)
    }
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onLoad={() => {
          console.log('[Payment] Razorpay SDK script loaded')
          setSdkLoaded(true)
        }}
        onError={() => {
          console.error('[Payment] Failed to load Razorpay SDK')
          setError('Failed to load payment SDK')
          setLoading(false)
        }}
      />

      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: 'var(--font-body, sans-serif)',
      }}>
        <div style={{
          background: 'white',
          borderRadius: 20,
          padding: 32,
          maxWidth: 400,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}>
          {paymentConfirmed ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1a1f2e', margin: '0 0 8px' }}>
                Payment Confirmed!
              </h2>
              <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
                Redirecting to your order...
              </p>
            </div>
          ) : loading ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12, animation: 'spin 2s linear infinite' }}>📱</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a1f2e', margin: '0 0 8px' }}>
                UPI Payment
              </h2>
              <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
                Initializing secure UPI payment...
              </p>
              <style>{`
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a1f2e', margin: '0 0 8px' }}>
                Payment Error
              </h2>
              <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                {error}
              </p>
              <button
                onClick={() => window.location.reload()}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          ) : processing ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔄</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a1f2e', margin: '0 0 8px' }}>
                Waiting for UPI Payment
              </h2>
              <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
                Please complete payment in your UPI app (PhonePe, Google Pay, Paytm, etc.)
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading payment...</div>}>
      <PaymentPageContent />
    </Suspense>
  )
}
