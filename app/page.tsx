'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, useScroll, useTransform, useInView, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'

export default function LandingPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const carouselWrapperRef = useRef<HTMLDivElement>(null)
  const [isChecking, setIsChecking] = useState(true)
  const [scrollY, setScrollY] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [user, setUser] = useState<{ id: string; name?: string; email?: string } | null>(null)
  const [restaurants, setRestaurants] = useState<{ name: string; image: string; image_url?: string }[]>([])

  // Safety timeout: Force page to render after 15 seconds max
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      if (isChecking) {
        console.warn('Page load timeout - forcing render')
        setIsChecking(false)
      }
    }, 15000)
    return () => clearTimeout(safetyTimer)
  }, [])

  const { scrollY: scrollYProgress } = useScroll()
  const heroY = useTransform(scrollYProgress, [0, 600], [0, -80])
  const heroOpacity = useTransform(scrollYProgress, [0, 400], [1, 0])

  // Detect mobile and redirect
  useEffect(() => {
    const isMobileDevice = () => {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
      return /iPhone|iPad|iPod|Android|Mobile|Tablet|webOS|BlackBerry|Windows Phone/i.test(userAgent)
    }

    if (isMobileDevice()) {
      router.replace('/mobile')
      return
    }
  }, [router])

  useEffect(() => {
    let isMounted = true

    const checkAuth = async () => {
      try {
        // Check if we've already shown splash (splash=true param means user already saw it)
        const params = new URLSearchParams(window.location.search)
        const hasSplash = params.get('splash') === 'true'

        const sessionPromise = Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Session fetch timeout')), 8000))
        ])

        const { data: { session } } = await sessionPromise as any

        if (!isMounted) return

        if (!session && !hasSplash) {
          router.replace('/splash')
        } else if (session && !hasSplash) {
          router.replace('/splash')
        } else if (session && hasSplash) {
          // Authenticated & already seen splash → show landing page
          if (isMounted) setIsChecking(false)

          // Fetch user profile for students
          try {
            const result = await Promise.race([
              supabase
                .from('profiles')
                .select('id, name, email')
                .eq('id', session.user.id)
                .single(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Profile fetch timeout')), 8000))
            ]) as any

            if (isMounted) {
              if (result.error) {
                console.error('Profile fetch error:', result.error)
                setUser({ id: session.user.id, email: session.user.email })
              } else if (result.data) {
                setUser({ id: session.user.id, name: result.data.name, email: result.data.email })
              }
            }
          } catch (error) {
            console.error('Profile fetch error:', error)
            if (isMounted) setUser({ id: session.user.id, email: session.user.email })
          }
        } else {
          // Unauthenticated with splash=true
          if (isMounted) setIsChecking(false)
        }
      } catch (error) {
        console.error('Auth check error:', error)
        if (isMounted) setIsChecking(false)
      }
    }

    // Fetch cafeterias from database
    const fetchCafeterias = async () => {
      try {
        const result = await Promise.race([
          supabase
            .from('cafeterias')
            .select('name, image_url')
            .order('name', { ascending: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Cafeterias fetch timeout')), 8000))
        ]) as any

        if (isMounted) {
          if (result.error) {
            console.error('Cafeterias fetch error:', result.error)
            setRestaurants([])
          } else if (result.data) {
            const cafeList = result.data.map((cafe: any) => {
              let imageUrl = cafe.image_url
              if (!imageUrl) {
                if (cafe.name === 'Main Block Cafeteria') {
                  imageUrl = 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=600&h=400&fit=crop'
                } else {
                  imageUrl = `https://images.unsplash.com/photo-${Math.random() > 0.5 ? '1565299585323-38d6b0865b47' : '1568901346375-23c9450c58cd'}?w=500&h=400&fit=crop`
                }
              }
              return {
                name: cafe.name,
                image_url: cafe.image_url,
                image: imageUrl
              }
            })
            setRestaurants(cafeList)
          }
        }
      } catch (error) {
        console.error('Cafeterias fetch error:', error)
        if (isMounted) setRestaurants([])
      }
    }

    checkAuth()
    fetchCafeterias()

    return () => {
      isMounted = false
    }
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  useEffect(() => {
    const onScroll = () => {
      setScrollY(window.scrollY)
    }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Enhanced video autoplay for mobile and web
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const playVideo = () => {
      if (video && video.paused) {
        const playPromise = video.play()
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.log('Video autoplay prevented:', error.name)
            // If autoplay fails, try again on first user interaction
            const playOnInteraction = () => {
              video.play().catch(() => {})
              document.removeEventListener('click', playOnInteraction)
              document.removeEventListener('touchstart', playOnInteraction)
            }
            document.addEventListener('click', playOnInteraction, { once: true })
            document.addEventListener('touchstart', playOnInteraction, { once: true })
          })
        }
      }
    }

    // Try multiple approaches for maximum compatibility
    const handlers = {
      loadstart: () => { if (video.readyState >= 2) playVideo() },
      loadeddata: playVideo,
      loadedmetadata: playVideo,
      canplay: playVideo,
      playing: () => { } // Just track when playing
    }

    Object.entries(handlers).forEach(([event, handler]) => {
      video.addEventListener(event, handler as EventListener)
    })

    // Also try immediately with a small delay if already loaded
    if (video.readyState >= 2) {
      playVideo()
    } else {
      setTimeout(() => {
        if (video.readyState >= 2) playVideo()
      }, 500)
    }

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        video.removeEventListener(event, handler as EventListener)
      })
    }
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }


  const steps = [
    { n: '01', title: 'Browse & Choose', desc: "Open Yoters, pick your cafeteria, browse today's menu and add items to your cart — all before your break starts.", img: '🍽️', bg: '#fff0f2' },
    { n: '02', title: 'Pre-order & Pay', desc: 'Place your order, pay via UPI in seconds. Your queue position is reserved instantly.', img: '📱', bg: '#fff8ec' },
    { n: '03', title: 'Walk in. Pick up. Leave.', desc: 'Head to the counter when your order is marked ready. Skip the entire queue.', img: '🎉', bg: '#edfaf3' },
  ]

  const aboutCards = [
    { icon: '📅', title: 'Pre-book Before Break', desc: "Order your meal before your break starts so it's ready the moment you walk in." },
    { icon: '⚡', title: 'Zero Queue Time', desc: 'Walk in, pick up your food, and leave — no waiting in lines, no wasted break time.' },
    { icon: '♻️', title: 'Reduce Food Waste', desc: 'Cafeterias prepare based on real demand — exact quantities, fresher food, less waste.' },
  ]

  const transitionEase = [0.22, 1, 0.36, 1] as const

  const whyCards = [
    { n: '01', title: 'Know Your Meal in Advance', desc: 'Browse the menu, choose your meal, and schedule pickup before your break even begins.' },
    { n: '02', title: 'No More Waiting', desc: 'Walk straight to the counter, collect your food, and leave — no queues, no rush.' },
    { n: '03', title: 'Less Waste, Smarter Cooking', desc: 'Cafeterias prepare food based on real demand, reducing waste and serving students better.' },
  ]

  const foodEmojis = ['🍛', '🥟', '🍕', '🥗', '🍜', '🫕', '🥘', '🍱', '🥙', '🍔', '🧆', '🍝']

  const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: transitionEase } }
  }

  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12 } }
  }

  const slideLeft = {
    hidden: { opacity: 0, x: -60 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.65, ease: transitionEase } }
  }

  const slideRight = {
    hidden: { opacity: 0, x: 60 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.65, ease: transitionEase } }
  }

  const scaleIn = {
    hidden: { opacity: 0, scale: 0.92 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.55, ease: transitionEase } }
  }

  function Section({ children, className, id, style }: { children: React.ReactNode, className?: string, id?: string, style?: React.CSSProperties }) {
    const ref = useRef(null)
    const inView = useInView(ref, { once: true, margin: '-80px' })
    return (
      <motion.section
        ref={ref}
        id={id}
        className={className}
        style={style}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
      >
        {children}
      </motion.section>
    )
  }

  if (isChecking) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,700&family=DM+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #fdf8f5; }
        .lp { background: #fdf8f5; color: #1a1f2e; font-family: 'DM Sans', sans-serif; overflow-x: hidden; position: relative; }

        .glitch { position: relative; display: inline-block; cursor: pointer; transition: color 0.2s; }
        .glitch:hover { color: #E8334A !important; }
        .glitch::before, .glitch::after { content: attr(data-text); position: absolute; left: 0; top: 0; width: 100%; height: 100%; opacity: 0; pointer-events: none; }
        .glitch:hover::before { opacity: 0.7; color: #E8334A; clip-path: polygon(0 20%, 100% 20%, 100% 40%, 0 40%); animation: glitch1 0.3s steps(1) infinite; }
        .glitch:hover::after { opacity: 0.5; color: #1a1f2e; clip-path: polygon(0 60%, 100% 60%, 100% 80%, 0 80%); animation: glitch2 0.3s steps(1) infinite; }
        @keyframes glitch1 { 0%,100%{transform:translateX(-2px) skewX(-1deg)} 25%{transform:translateX(2px) skewX(1deg)} 50%{transform:translateX(-1px)} 75%{transform:translateX(3px) skewX(-2deg)} }
        @keyframes glitch2 { 0%,100%{transform:translateX(2px) skewX(1deg)} 25%{transform:translateX(-2px) skewX(-1deg)} 50%{transform:translateX(1px)} 75%{transform:translateX(-3px) skewX(2deg)} }

        .lp-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; padding: 14px 48px; display: flex; align-items: center; justify-content: space-between; transition: all 0.3s; }
        .lp-nav.scrolled { background: rgba(253,248,245,0.95); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(26,31,46,0.07); box-shadow: 0 2px 24px rgba(26,31,46,0.06); padding: 10px 48px; }
        .lp-nav-links { display: flex; gap: 36px; list-style: none; }
        .lp-nav-links a { color: #4a5068; font-size: 14px; font-weight: 500; text-decoration: none; cursor: pointer; }
        .lp-nav-right { display: flex; gap: 10px; align-items: center; }
        .profile-avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--accent, #E8334A); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; cursor: pointer; position: relative; }
        .profile-menu { position: absolute; top: 50px; right: 0; background: white; border: 1px solid #eee; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); min-width: 220px; z-index: 200; }
        .profile-menu-item { padding: 12px 16px; border-bottom: 1px solid #f0f0f0; cursor: pointer; font-size: 14px; color: #333; }
        .profile-menu-item:last-child { border-bottom: none; }
        .profile-menu-item:hover { background: #f8f8f8; }
        .profile-menu-item.logout { color: #E8334A; font-weight: 600; }
        .lp-vendor-btn { padding: 9px 20px; border: 1.5px solid rgba(26,31,46,0.15); border-radius: 10px; background: transparent; color: #4a5068; font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; text-decoration: none; display: inline-block; transition: all 0.2s; }
        .lp-vendor-btn:hover { border-color: #E8334A; color: #E8334A; }
        .lp-join-btn { padding: 10px 22px; background: #E8334A; color: white; border: none; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 10px; transition: all 0.2s; }
        .lp-join-btn:hover { background: #c9293f; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(232,51,74,0.3); }
        .hamburger-btn { display: none; background: none; border: none; cursor: pointer; padding: 4px; }
        .hamburger-btn span { display: block; width: 22px; height: 2px; background: #1a1f2e; margin: 5px 0; border-radius: 2px; }

        .btn-primary { padding: 16px 40px; background: #E8334A; color: white; border: none; font-family: 'DM Sans', sans-serif; font-size: 16px; font-weight: 700; cursor: pointer; border-radius: 12px; transition: all 0.3s cubic-bezier(0.22,1,0.36,1); box-shadow: 0 4px 12px rgba(232,51,74,0.15); letter-spacing: 0.3px; }
        .btn-primary:hover { background: #d42a40; transform: translateY(-3px); box-shadow: 0 12px 32px rgba(232,51,74,0.35); }
        .btn-primary:active { transform: translateY(-1px); }
        .btn-outline { padding: 16px 40px; background: transparent; color: #1a1f2e; border: 1.5px solid rgba(26,31,46,0.2); font-family: 'DM Sans', sans-serif; font-size: 16px; font-weight: 700; cursor: pointer; border-radius: 12px; transition: all 0.3s cubic-bezier(0.22,1,0.36,1); letter-spacing: 0.3px; }
        .btn-outline:hover { border-color: #E8334A; color: #E8334A; background: rgba(232,51,74,0.02); transform: translateY(-2px); box-shadow: 0 8px 20px rgba(232,51,74,0.1); }

        .tag-dot { width: 6px; height: 6px; border-radius: 50%; background: #E8334A; animation: pulse 2s infinite; display:inline-block; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }

        .orbit-wrap { position: relative; width: 340px; height: 340px; margin: 0 auto; }
        .orbit-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 90px; height: 90px; border-radius: 50%; background: rgba(232,51,74,0.15); border: 2px solid rgba(232,51,74,0.4); display: flex; align-items: center; justify-content: center; font-size: 36px; z-index: 2; }
        .orbit-ring { position: absolute; top: 50%; left: 50%; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); transform: translate(-50%,-50%); }
        .orbit-ring-1 { width: 180px; height: 180px; animation: spin 8s linear infinite; }
        .orbit-ring-2 { width: 280px; height: 280px; animation: spin 14s linear infinite reverse; }
        .orbit-ring-3 { width: 340px; height: 340px; animation: spin 22s linear infinite; }
        @keyframes spin { from{transform:translate(-50%,-50%) rotate(0deg)} to{transform:translate(-50%,-50%) rotate(360deg)} }
        .orbit-dot { position: absolute; width: 36px; height: 36px; border-radius: 50%; background: #1a1f2e; border: 1px solid rgba(232,51,74,0.4); display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .dot-top { top: -18px; left: 50%; transform: translateX(-50%); }
        .dot-right { right: -18px; top: 50%; transform: translateY(-50%); }
        .dot-bottom { bottom: -18px; left: 50%; transform: translateX(-50%); }
        .dot-left { left: -18px; top: 50%; transform: translateY(-50%); }

        .track-scroll { display: flex; gap: 32px; width: max-content; animation: scrollTrack 22s linear infinite; padding: 16px 0; }
        .track-scroll:hover { animation-play-state: paused; }
        @keyframes scrollTrack { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .track-emoji-wrap { width: 72px; height: 72px; border-radius: 50%; background: white; border: 1.5px solid rgba(232,51,74,0.15); display: flex; align-items: center; justify-content: center; font-size: 32px; box-shadow: 0 4px 16px rgba(26,31,46,0.06); transition: transform 0.2s; }
        .track-emoji-wrap:hover { transform: scale(1.15) rotate(8deg); }

        .lp-section { overflow-x: hidden; }
        .cafe-carousel-wrapper { overflow-x: auto; overflow-y: hidden; margin-bottom: 20px; width: 100%; max-width: 100%; position: relative; min-height: 320px; padding: 0; display: block !important; -webkit-overflow-scrolling: touch; scroll-behavior: smooth; }
        .cafe-carousel-scroll { display: flex; gap: 20px; width: max-content; padding: 0 48px; will-change: transform; }

        .cafe-carousel-card { transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); box-shadow: 0 12px 40px rgba(26,31,46,0.08); flex-shrink: 0; border: 1px solid rgba(255,255,255,0.1); }
        .cafe-carousel-card:hover { transform: translateY(-12px) scale(1.03); box-shadow: 0 24px 56px rgba(232,51,74,0.2), 0 0 0 1.5px rgba(232,51,74,0.15); }
        .cafe-carousel-card:hover img { filter: brightness(1.15) contrast(1.05); }
        @media (max-width: 768px) { .cafe-carousel-wrapper { margin-bottom: 100px; padding: 30px 0; } }

        .rest-card { background: white; border: 1px solid rgba(26,31,46,0.07); border-radius: 20px; padding: 28px 32px; display: flex; align-items: center; gap: 28px; cursor: pointer; }
        .rest-card:hover { border-color: rgba(232,51,74,0.25); box-shadow: 0 12px 48px rgba(232,51,74,0.08); }
        .rest-card-arrow { font-size: 20px; color: #E8334A; opacity: 0; transition: opacity 0.2s; }
        .rest-card:hover .rest-card-arrow { opacity: 1; }

        .how-card { border: 1px solid rgba(26,31,46,0.07); border-radius: 20px; padding: 32px 28px; position: relative; overflow: hidden; }
        .how-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background: linear-gradient(90deg,#E8334A,#ff8fa3); opacity:0; transition:opacity 0.3s; }
        .how-card:hover::before { opacity:1; }
        .how-card:hover { border-color: rgba(232,51,74,0.2); box-shadow: 0 16px 48px rgba(232,51,74,0.08); }

        .about-card { background: #fdf8f5; border: 1px solid rgba(26,31,46,0.07); border-radius: 20px; padding: 32px 28px; position: relative; overflow: hidden; }
        .about-card::after { content:''; position:absolute; bottom:0; left:0; right:0; height:3px; background: linear-gradient(90deg,#E8334A,#ff8fa3); transform:scaleX(0); transform-origin:left; transition:transform 0.3s; }
        .about-card:hover::after { transform:scaleX(1); }
        .about-card:hover { box-shadow: 0 12px 40px rgba(232,51,74,0.08); border-color: rgba(232,51,74,0.15); }

        .why-card { background: white; border: 1px solid rgba(26,31,46,0.07); border-radius: 20px; padding: 32px 28px; }
        .why-card:hover { border-color: rgba(232,51,74,0.2); box-shadow: 0 16px 48px rgba(232,51,74,0.1); }

        .footer-3d-inner { width:72px; height:72px; border-radius:50%; background: linear-gradient(135deg, rgba(232,51,74,0.3), rgba(255,143,163,0.1)); border: 1px solid rgba(232,51,74,0.3); display:flex; align-items:center; justify-content:center; font-size:32px; animation: float3d 4s ease-in-out infinite; }
        @keyframes float3d { 0%,100%{transform:translateY(0) rotate(0deg)} 33%{transform:translateY(-8px) rotate(5deg)} 66%{transform:translateY(4px) rotate(-3deg)} }

        .footer-back-btn { margin-top:16px; padding:11px 24px; border:1.5px solid rgba(255,255,255,0.15); border-radius:10px; background:transparent; color:rgba(255,255,255,0.5); font-family:'DM Sans',sans-serif; font-size:13px; cursor:pointer; transition:all 0.2s; font-weight:500; width:fit-content; }
        .footer-back-btn:hover { border-color:#E8334A; color:#E8334A; }
        .footer-nl-input { flex:1; padding:10px 14px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:white; font-family:'DM Sans',sans-serif; font-size:13px; outline:none; }
        .footer-nl-input::placeholder { color:rgba(255,255,255,0.2); }
        .footer-nl-btn { padding:10px 16px; background:#E8334A; border:none; border-radius:8px; color:white; font-size:13px; font-weight:600; cursor:pointer; }

        .mobile-menu-overlay { position:fixed; inset:0; background:#fdf8f5; z-index:99; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:36px; }

        @media (max-width: 900px) {
          .lp-nav { padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; }
          .lp-nav.scrolled { padding: 10px 16px; }
          .lp-nav-links { display: none !important; }
          .lp-nav-right { display: flex; gap: 10px; align-items: center; }
          .hamburger-btn { display: block; background: none; border: none; cursor: pointer; padding: 4px; }
          .lp-grid-3 { grid-template-columns: 1fr !important; }
          .lp-grid-2 { grid-template-columns: 1fr !important; }
          .lp-grid-4 { grid-template-columns: repeat(2,1fr) !important; }
          .lp-footer-grid { grid-template-columns: 1fr !important; gap: 20px !important; }
          .lp-section { padding: 40px 16px !important; }
          .lp-hero { padding: 80px 16px 40px !important; }
          .lp-hero video { width: 100% !important; }
          .orbit-wrap { display: none; }
          .rest-card { flex-direction: column; align-items: flex-start; gap: 16px; padding: 20px !important; }
          .lp-footer-bottom { flex-direction: column; gap: 8px; text-align: center; }
        }
        @media (max-width: 768px) {
          .lp-section { padding: 32px 16px !important; }
          .lp-hero { padding: 70px 16px 30px !important; }
          .lp-grid-4 { grid-template-columns: repeat(2,1fr) !important; }
          .lp-footer-grid { gap: 20px !important; }
        }
        @media (max-width: 480px) {
          .lp-section { padding: 24px 14px !important; }
          .lp-hero { padding: 60px 14px 24px !important; }
          .lp-grid-4 { grid-template-columns: 1fr !important; }
          .lp-hero video { width: 100% !important; opacity: 0.5 !important; }
          .lp-grid-3 { gap: 12px !important; }
          .lp-grid-2 { gap: 30px !important; }
          .lp-footer-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
        }
      `}</style>

      <div className="lp">

        {/* NAV */}
        <nav className={`lp-nav ${scrollY > 50 ? 'scrolled' : ''}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }} onClick={() => scrollTo('hero')}>
            <img src="/logo.png" alt="Yoters" style={{ width: 56, height: 56, objectFit: 'contain' }} onError={e => (e.currentTarget.style.display = 'none')} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 26, fontWeight: 700, color: '#E8334A', lineHeight: 1 }}>Yoters</span>
            </div>
          </div>
          <ul className="lp-nav-links">
            {[
              { label: 'How', id: 'howitworks' },
              { label: 'Why', id: 'why' },
              { label: 'Contact', id: 'contact' }
            ].map(item => (
              <li key={item.id}><a className="glitch" data-text={item.label} onClick={() => scrollTo(item.id)}>{item.label}</a></li>
            ))}
          </ul>
          <div className="lp-nav-right">
            {user && (
              <div style={{ position: 'relative' }}>
                <div className="profile-avatar" onClick={() => router.push('/profile')}>
                  {user.name ? user.name.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
            <button
              type="button"
              className="hamburger-btn"
              style={{ display: 'block' }}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen(!menuOpen)}>
              <span />
              <span />
              <span />
            </button>
          </div>
        </nav>

        <AnimatePresence>
          {menuOpen && (
            <motion.div className="mobile-menu-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {[
                { label: 'How', id: 'howitworks' },
                { label: 'Why', id: 'why' },
                { label: 'Contact', id: 'contact' }
              ].map(item => (
                <motion.a key={item.id} className="glitch" data-text={item.label}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  onClick={() => scrollTo(item.id)}
                  style={{ fontFamily: 'Playfair Display, serif', fontSize: 40, fontWeight: 700, color: '#1a1f2e', cursor: 'pointer' }}>
                  {item.label}
                </motion.a>
              ))}
              <button className="lp-join-btn" onClick={() => { scrollTo('contact'); setMenuOpen(false) }}>Join Now!</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* HERO */}
        <section id="hero" className="lp-hero" style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', padding: '120px 48px 80px', background: 'linear-gradient(135deg, #fdf8f5 0%, #fff8f0 50%, #fdf8f5 100%)' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 180% 180% at 100% 40%, rgba(232,51,74,0.08) 0%, transparent 50%)', zIndex: 0 }} />
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            webkit-playsinline="true"
            preload="auto"
            style={{
              position: 'absolute', right: -40, top: 0,
              width: '85%', height: '100%',
              objectFit: 'cover', zIndex: 0,
              opacity: 0.7,
              maskImage: 'linear-gradient(to left, black 15%, rgba(0,0,0,0.6) 50%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to left, black 15%, rgba(0,0,0,0.6) 50%, transparent 100%)',
              pointerEvents: 'none',
              display: 'block',
              filter: 'brightness(1.05) contrast(1.1)'
            } as any}
          >
            <source src="/hero-video.mp4" type="video/mp4" />
          </video>
          <motion.div style={{ position: 'relative', zIndex: 2, maxWidth: 680, y: heroY, opacity: heroOpacity }}>
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(232,51,74,0.1)', border: '1px solid rgba(232,51,74,0.25)', color: '#E8334A', padding: '8px 18px', borderRadius: 20, marginBottom: 32, fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', backdropFilter: 'blur(8px)' }}>
              <span className="tag-dot" /> Now accepting early access
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: [0.22,1,0.36,1] }}
              style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(48px, 7vw, 92px)', fontWeight: 700, lineHeight: 1, letterSpacing: -2, color: '#1a1f2e', marginBottom: 24 }}>
              Skip the<br /><em style={{ fontStyle: 'italic', color: '#E8334A', fontWeight: 700 }}>Cafeteria Rush.</em>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
              style={{ fontSize: 20, color: '#5a6078', lineHeight: 1.8, maxWidth: 520, marginBottom: 40, fontWeight: 400 }}>
              Pre-book your meal before your break. Walk in, pick up, leave. Zero queues. Fresh food. Every time.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
              style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn-primary" onClick={() => scrollTo('contact')} style={{ padding: '16px 40px', fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>Start Ordering →</button>
              <button className="btn-outline" onClick={() => scrollTo('howitworks')} style={{ padding: '16px 40px', fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>Learn How →</button>
            </motion.div>
          </motion.div>
        </section>

        {/* OUR CAFETERIAS - FEATURED RESTAURANTS */}
        <section className="lp-section" style={{ padding: '80px 48px 60px 48px', background: '#fdf8f5', borderBottom: '1px solid rgba(26,31,46,0.06)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
              <motion.p variants={fadeUp} style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#E8334A', marginBottom: 16 }}>Campus Cafeterias</motion.p>
              <motion.h2 variants={fadeUp} style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(32px,4vw,56px)', fontWeight: 700, color: '#1a1f2e', lineHeight: 1.15, marginBottom: 16 }}>
                Every Cafeteria.<br /><span style={{ color: '#E8334A', fontStyle: 'italic', fontWeight: 700 }}>One App.</span>
              </motion.h2>
              <motion.p variants={fadeUp} style={{ fontSize: 18, color: '#7a8296', maxWidth: 560, lineHeight: 1.8, marginBottom: 64, fontWeight: 400 }}>
                Browse all campus cafeterias in real-time. Pre-order your meal with just a few taps, and pick it up when it's ready.
              </motion.p>
            </motion.div>

            {/* Horizontal Scrolling Carousel */}
            {restaurants && restaurants.length > 0 ? (
              <div className="cafe-carousel-wrapper" ref={carouselWrapperRef} onMouseEnter={() => { const el = document.querySelector('.cafe-carousel-scroll') as HTMLElement; if (el) el.style.animationPlayState = 'paused' }} onMouseLeave={() => { const el = document.querySelector('.cafe-carousel-scroll') as HTMLElement; if (el) el.style.animationPlayState = 'running' }}>
                <motion.div className="cafe-carousel-scroll" animate={{ x: [0, -500] }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}>
                  {[...restaurants, ...restaurants].map((r, i) => (
                    <motion.div key={i}
                      className="cafe-carousel-card"
                      whileHover={{ y: -8, transition: { duration: 0.3 } }}
                      style={{ position: 'relative', minWidth: 320, height: 300, borderRadius: 24, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 12px 40px rgba(26,31,46,0.08)', border: '1px solid rgba(26,31,46,0.05)' }}>
                      {/* Background Image */}
                      <img src={r.image} alt={r.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s ease' }} />

                      {/* Premium Gradient Overlay */}
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.45) 100%)' }} />

                      {/* Content - Just the name */}
                      <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'flex-end', padding: 32, color: 'white' }}>
                        <div>
                          <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: 28, fontWeight: 700, lineHeight: 1.2, maxWidth: '95%', letterSpacing: -0.5 }}>
                            {r.name}
                          </h3>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            ) : (
              <div style={{ height: 320, background: '#f5f1ed', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 60 }}>
                <p style={{ color: '#999', fontSize: 16 }}>Loading cafeterias...</p>
              </div>
            )}

            {/* CTA Button - Separate Below */}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} style={{ marginTop: 48 }}>
              <Link href="/browse" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 40px', background: '#E8334A', color: 'white', borderRadius: 12, fontWeight: 700, fontSize: 16, textDecoration: 'none', transition: 'all 0.3s cubic-bezier(0.22,1,0.36,1)', letterSpacing: 0.5 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 32px rgba(232,51,74,0.35)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(232,51,74,0.15)' }}>
                Wanna start ordering? →
              </Link>
            </motion.div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="howitworks" className="lp-section" style={{ padding: '100px 48px', background: '#faf9f7', borderBottom: '1px solid rgba(26,31,46,0.06)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
              <motion.p variants={fadeUp} style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#E8334A', marginBottom: 16 }}>How It Works</motion.p>
              <motion.h2 variants={fadeUp} style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(32px,4vw,56px)', fontWeight: 700, color: '#1a1f2e', lineHeight: 1.15, marginBottom: 16 }}>
                Three Steps to<br /><span style={{ color: '#E8334A', fontStyle: 'italic', fontWeight: 700 }}>Zero Waiting.</span>
              </motion.h2>
              <motion.p variants={fadeUp} style={{ fontSize: 18, color: '#7a8296', maxWidth: 560, lineHeight: 1.8, marginBottom: 64, fontWeight: 400 }}>
                Browse, order, and pick up — all before your break even starts. Simple. Fast. Fresh.
              </motion.p>
            </motion.div>
            <div className="lp-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 28 }}>
              {steps.map((step, i) => (
                <motion.div key={i} className="how-card"
                  style={{ background: step.bg, marginTop: i === 1 ? 24 : i === 2 ? 48 : 0, cursor: 'pointer', boxShadow: '0 8px 24px rgba(26,31,46,0.05)', border: '1px solid rgba(26,31,46,0.06)' }}
                  initial={{ opacity: 0, x: -100, y: 20 }}
                  whileInView={{ opacity: 1, x: 0, y: i === 1 ? 24 : i === 2 ? 48 : 0 }}
                  viewport={{ once: true, margin: '-100px' }}
                  transition={{ duration: 0.8, delay: i * 0.2, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: (i === 1 ? 24 : i === 2 ? 48 : 0) - 16, scale: 1.06, boxShadow: '0 24px 48px rgba(232,51,74,0.15)', transition: { duration: 0.35 } }}>
                  <span style={{ fontSize: 60, marginBottom: 24, display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.05))' }}>{step.img}</span>
                  <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#E8334A', marginBottom: 14, textTransform: 'uppercase' }}>Step {step.n}</div>
                  <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, fontWeight: 700, color: '#1a1f2e', marginBottom: 12, lineHeight: 1.3 }}>{step.title}</h3>
                  <p style={{ fontSize: 15, color: '#7a8296', lineHeight: 1.8, fontWeight: 400 }}>{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* FOOD TRACK */}
        <section style={{ padding: '80px 0', background: '#fdf8f5', overflow: 'hidden', borderTop: '1px solid rgba(26,31,46,0.06)', borderBottom: '1px solid rgba(26,31,46,0.06)' }}>
          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#E8334A', marginBottom: 12 }}>Always Fresh</motion.p>
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: 'center', fontFamily: 'Playfair Display, serif', fontSize: 'clamp(22px,3vw,36px)', fontWeight: 700, color: '#1a1f2e', marginBottom: 8 }}>Every Cuisine. One Platform.</motion.h2>
          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} style={{ textAlign: 'center', fontSize: 15, color: '#8a90a8', marginBottom: 40, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.7 }}>
            From South Indian breakfasts to multi-cuisine lunches — your entire campus food scene, right here.
          </motion.p>
          <div style={{ overflow: 'hidden' }}>
            <div className="track-scroll">
              {[...foodEmojis, ...foodEmojis].map((emoji, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div className="track-emoji-wrap">{emoji}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* WHY */}
        <section id="why" className="lp-section" style={{ padding: '100px 48px', background: '#fdf8f5', borderBottom: '1px solid rgba(26,31,46,0.06)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
              <motion.p variants={fadeUp} style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#E8334A', marginBottom: 16 }}>Why Choose Us</motion.p>
              <motion.h2 variants={fadeUp} style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(32px,4vw,56px)', fontWeight: 700, color: '#1a1f2e', lineHeight: 1.15, marginBottom: 16 }}>
                Why Yoters<br /><span style={{ color: '#E8334A', fontStyle: 'italic', fontWeight: 700 }}>Changes Everything.</span>
              </motion.h2>
              <motion.p variants={fadeUp} style={{ fontSize: 18, color: '#7a8296', maxWidth: 560, lineHeight: 1.8, marginBottom: 64, fontWeight: 400 }}>
                Every break is precious. Every minute counts. Pre-order ensures you never waste another second waiting in line.
              </motion.p>
            </motion.div>
            <div className="lp-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 28 }}>
              {whyCards.map((card, i) => (
                <motion.div key={i} className="why-card"
                  initial={{ opacity: 0, x: -100, y: 20 }}
                  whileInView={{ opacity: 1, x: 0, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.8, delay: i * 0.2, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ scale: 1.03, y: -6, transition: { duration: 0.3 } }}
                  style={{ boxShadow: '0 8px 24px rgba(26,31,46,0.05)', border: '1px solid rgba(26,31,46,0.06)', background: 'white' }}>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 64, fontWeight: 700, color: 'rgba(232,51,74,0.08)', lineHeight: 1, marginBottom: 20 }}>{card.n}</div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: '#1a1f2e', marginBottom: 12, lineHeight: 1.3, fontFamily: 'Playfair Display, serif' }}>{card.title}</h3>
                  <p style={{ fontSize: 15, color: '#7a8296', lineHeight: 1.8, fontWeight: 400 }}>{card.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section id="contact" className="lp-section" style={{ padding: '120px 48px', background: 'linear-gradient(135deg, #1a1f2e 0%, #0f1219 100%)', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,51,74,0.15) 0%, transparent 65%)', pointerEvents: 'none', filter: 'blur(40px)' }} />
          <div style={{ position: 'absolute', bottom: '-15%', left: '-8%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,51,74,0.08) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(40px)' }} />
          <motion.div style={{ position: 'relative', zIndex: 2, maxWidth: 700, margin: '0 auto' }}
            initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
            <motion.p variants={fadeUp} style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#ff8fa3', marginBottom: 20 }}>Get Started Now</motion.p>
            <motion.h2 variants={fadeUp} style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(36px,5vw,64px)', fontWeight: 700, color: 'white', lineHeight: 1.1, marginBottom: 20, letterSpacing: -1 }}>
              Skip the<br /><em style={{ fontStyle: 'italic', color: '#ff8fa3', fontWeight: 700 }}>Queue Forever.</em>
            </motion.h2>
            <motion.p variants={fadeUp} style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, marginBottom: 48, fontWeight: 400 }}>
              Join hundreds of students already pre-ordering their meals. Fresh food. Zero waiting. Every break.
            </motion.p>
            <motion.div variants={scaleIn} style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn-primary" style={{ padding: '18px 44px', fontSize: 17, fontWeight: 700 }}
                onClick={() => router.push('/browse')}>
                Start Ordering Now →
              </button>
            </motion.div>
          </motion.div>
        </section>

        {/* STATS */}
        <section className="lp-section" style={{ padding: '80px 48px', background: 'white' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <motion.div className="lp-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'rgba(26,31,46,0.06)', borderRadius: 20, overflow: 'hidden' }}
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
              {[{ val: 'Students', label: 'Built for' }, { val: 'Cafeterias', label: 'Partnering with' }, { val: 'Zero Waste', label: 'Real demand only' }, { val: 'Soon', label: 'Launching' }].map((s, i) => (
                <motion.div key={i} variants={fadeUp} style={{ padding: '40px 24px', textAlign: 'center', background: 'white' }}>
                  <h3 style={{ fontFamily: 'Playfair Display, serif', fontSize: 32, fontWeight: 700, color: '#E8334A', marginBottom: 6 }}>{s.val}</h3>
                  <p style={{ fontSize: 11, color: '#8a90a8', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="lp-section" style={{ background: '#1a1f2e', padding: '72px 48px 40px' }}>
          <div className="lp-footer-grid" style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr', gap: 60, marginBottom: 56 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginBottom: 14 }} onClick={() => scrollTo('hero')}>
                <img src="/logo.png" alt="Yoters" style={{ width: 52, height: 52, objectFit: 'contain' }} onError={e => (e.currentTarget.style.display = 'none')} />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, fontWeight: 700, color: 'white' }}>Yoters</span>
                </div>
              </div>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, maxWidth: 260, marginBottom: 24 }}>Skip the queue. Pre-book your meal. Walk in, pick up, and enjoy your break.</p>
              <div className="footer-3d-inner">🐧</div>
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)', marginBottom: 20 }}>Navigation</p>
              {[
                { label: 'How', id: 'howitworks' },
                { label: 'Why', id: 'why' },
                { label: 'Contact', id: 'contact' }
              ].map(item => (
                <a key={item.id} className="glitch" data-text={item.label} onClick={() => scrollTo(item.id)}
                  style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontWeight: 500, marginBottom: 12, display: 'block' }}>{item.label}</a>
              ))}
              <Link href="/browse" className="glitch" data-text="Browse Cafeterias"
                style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', fontWeight: 500, marginBottom: 12, display: 'block' }}>Browse Cafeterias</Link>
              <button className="footer-back-btn" onClick={() => scrollTo('hero')}>↑ Back to Top</button>
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)', marginBottom: 20 }}>Connect</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                {[{ href: 'https://x.com/YotersOfficial', label: '𝕏' }, { href: 'https://www.instagram.com/yotersofficial.tech', label: 'IG' }, { href: 'https://www.linkedin.com/company/yotersofficial', label: 'in' }].map(s => (
                  <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className="glitch" data-text={s.label}
                    style={{ width: 38, height: 38, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, textDecoration: 'none', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                    {s.label}
                  </a>
                ))}
              </div>
              <div style={{ marginBottom: 12 }}><span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', display: 'block', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2, fontWeight: 600 }}>Email</span><p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>yotersofficial@gmail.com</p></div>
              <div style={{ marginBottom: 12 }}><span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', display: 'block', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2, fontWeight: 600 }}>Location</span><p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>Bengaluru, Karnataka, IN</p></div>
              <div style={{ marginTop: 20 }}>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)', display: 'block', marginBottom: 8 }}>Subscribe to updates</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="footer-nl-input" type="email" placeholder="you@college.edu" />
                  <button className="footer-nl-btn">→</button>
                </div>
              </div>
            </div>
          </div>
          <div className="lp-footer-bottom" style={{ maxWidth: 1100, margin: '0 auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)' }}>© {new Date().getFullYear()} Yoters. All Rights Reserved.</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)' }}>Built with ❤️ for students</p>
          </div>
        </footer>
      </div>
    </>
  )
}