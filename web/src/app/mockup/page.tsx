'use client'

// Gemini-generated Queue patient mockup, hosted as a route so it can be clicked
// through at /mockup. Kept verbatim apart from two fixes needed to make it run:
//
//  1. 'use client' — it holds state, and app-router files are server components
//     by default.
//  2. HomeIcon and MessageSquare were used in TabBar but missing from the import
//     list, so it threw "HomeIcon is not defined" the moment the home screen
//     rendered, which is the default screen. Both exist in lucide-react; they
//     were simply never imported.
//
// This is a static mockup: no backend calls, no real data.

import React, { useState } from 'react'
import {
  Search, Calendar, User, Heart, Shield, Bell, Video, Mic, Phone, PhoneOff,
  Ambulance, MapPin, CreditCard, Plus, Check, AlertTriangle, X, Info, Star,
  Wallet, Activity, FileText, FileImage, ShieldAlert, Settings, Grid, Clock,
  Navigation, Lock, Eye, QrCode, Send, Paperclip, FlaskConical, Clipboard,
  Headphones, LogOut, Moon, Fingerprint, Smartphone, ChevronRight, ChevronDown,
  CheckCircle2, XCircle, Pill, Building2, Filter, Wifi, Signal, BatteryMedium,
  HomeIcon, MessageSquare,
} from 'lucide-react'

export default function QueuePatientApp() {
  const [currentScreen, setCurrentScreen] = useState('p-home')
  const [history, setHistory] = useState<string[]>([])
  const [tabState, setTabState] = useState<Record<string, string | number>>({
    res: 'Hospitals',
    mode: 'In person',
    ptab: 'About',
    vmode: 'Video',
    amb: 'Emergency',
    pm: 'Card',
    ap: 'Upcoming',
    rec: 'Lab Results',
    msg: 'All',
    who: 'Me',
    stars: 5,
    day: '13',
    slot: '9:30',
    duty: 'On duty',
    dq: 'In person',
    dm: 'Online queue',
    wu: 'Routine',
    wd: 'Bello',
    wp: 'Paystack link',
    tw: '',
    ta: '',
    tb: '',
  })
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2000)
  }

  const navigate = (screenId: string) => {
    setHistory([...history, currentScreen])
    setCurrentScreen(screenId)
  }

  const goBack = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1]
      setHistory(history.slice(0, -1))
      setCurrentScreen(prev)
    }
  }

  const updateTab = (key: string, value: string | number) => {
    setTabState({ ...tabState, [key]: value })
  }

  // Shared Components
  const StatusBar = () => (
    <div className="flex justify-between items-center px-6 py-2 text-xs font-bold text-gray-900 bg-transparent">
      <span>9:41</span>
      <div className="flex items-center gap-1.5">
        <Signal size={12} />
        <Wifi size={12} />
        <BatteryMedium size={14} />
      </div>
    </div>
  )

  const Header = ({ title, back, sub, right, big }: any) => (
    <div className="bg-gradient-to-br from-[#13857B] via-[#0E6863] to-[#0B4B4A] text-white pb-5 flex-shrink-0">
      <StatusBar />
      <div className={`flex items-center gap-2.5 px-4 pt-2 font-bold ${big ? 'text-xl' : 'text-lg'}`}>
        {back && (
          <button onClick={goBack} aria-label="Back" className="p-1">
            <ChevronRight className="rotate-180" size={20} />
          </button>
        )}
        <span>{title}</span>
        <span className="flex-1" />
        {right}
      </div>
      {sub && <p className="mx-4 mt-1.5 text-xs opacity-85">{sub}</p>}
    </div>
  )

  const TabBar = ({ active }: { active: string }) => {
    const tabs = [
      { label: 'Home', icon: HomeIcon, go: 'p-home', dot: false },
      { label: 'Appointments', icon: Calendar, go: 'p-appts', dot: false },
      { label: 'Messages', icon: MessageSquare, go: 'p-messages', dot: true },
      { label: 'Profile', icon: User, go: 'p-profile', dot: false },
    ]

    return (
      <nav className="flex justify-around border-t border-gray-100 py-2 px-1 bg-white flex-shrink-0">
        {tabs.map((t) => {
          const Icon = t.icon
          const isActive = active === t.go
          return (
            <button
              key={t.go}
              onClick={() => navigate(t.go)}
              className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold min-w-[60px] ${isActive ? 'text-[#0F766E]' : 'text-gray-400'}`}
            >
              <div className="relative">
                <Icon size={20} />
                {t.dot && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
              </div>
              {t.label}
            </button>
          )
        })}
      </nav>
    )
  }

  // Dummy avatar generator
  const Avatar = ({ name, bg = 'bg-teal-50', text = 'text-teal-700' }: any) => (
    <div className={`w-10 h-10 rounded-full ${bg} ${text} flex items-center justify-center font-bold text-sm flex-shrink-0`}>
      {name.split(' ').map((n: string) => n[0]).join('')}
    </div>
  )

  // Screen Renders
  const renderScreenContent = () => {
    switch (currentScreen) {
      case 'p-splash':
        return (
          <div className="flex-1 flex flex-col bg-gradient-to-b from-[#F2FAF9] to-white h-full">
            <StatusBar />
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
              <div className="w-20 h-20 rounded-2xl bg-[#0F766E] flex items-center justify-center shadow-lg">
                <Plus className="text-white w-10 h-10" />
              </div>
              <h1 className="text-4xl font-extrabold text-[#134E4A] tracking-tight">Queue</h1>
              <p className="text-sm font-semibold text-[#0F766E] leading-relaxed">
                Better Access.<br />Healthier Tomorrow.
              </p>
            </div>
            <div className="p-6 flex flex-col items-center gap-4">
              <button onClick={() => navigate('p-login')} className="w-full h-12 rounded-xl bg-gradient-to-r from-[#0F766E] to-[#125E5A] text-white font-bold shadow-md">
                Get Started
              </button>
              <span className="w-2.5 h-2.5 border-2 border-gray-400 rounded-full" />
            </div>
          </div>
        )

      case 'p-login':
        return (
          <div className="flex-1 flex flex-col h-full bg-white">
            <StatusBar />
            <div className="text-center text-xs text-gray-400 mt-2">Queue</div>
            <div className="px-5 pt-8 flex flex-col gap-3 flex-1">
              <div>
                <h2 className="text-2xl font-extrabold text-[#0B3B3F]">Welcome to Queue</h2>
                <p className="text-xs text-gray-500 mt-1">Sign in to continue</p>
              </div>
              <div className="flex items-center gap-2 px-3 h-12 border border-gray-200 rounded-xl mt-3 text-gray-800 text-sm bg-white">
                <Smartphone size={16} className="text-gray-400" />
                <span className="font-medium">+234 803 000 0000</span>
              </div>
              <div className="flex items-center gap-2 px-3 h-12 border border-gray-200 rounded-xl text-gray-400 text-sm bg-white">
                <span className="flex-1">Password</span>
                <Eye size={16} />
              </div>
              <button onClick={() => showToast('Reset link sent by SMS')} className="self-end text-xs text-[#0F766E] font-bold">
                Forgot password?
              </button>
              <button onClick={() => navigate('p-role')} className="w-full h-12 rounded-xl bg-[#0F766E] text-white font-bold mt-2 shadow-md">
                Sign in
              </button>
              <button onClick={() => navigate('p-role')} className="w-full h-12 rounded-xl bg-[#F1F6F6] text-[#134E4A] font-bold">
                Create account
              </button>
              <button onClick={() => showToast('Code sent to 0803…000')} className="text-center text-xs text-[#0F766E] font-bold mt-2">
                Sign in with a one time code instead
              </button>
            </div>
            <div className="flex justify-center pb-5">
              <span className="w-2.5 h-2.5 border-2 border-gray-400 rounded-full" />
            </div>
          </div>
        )

      case 'p-role': {
        const roles = [
          ['patient', 'Patient', 'Book, consult, manage care', 'bg-teal-50', 'text-[#0F766E]'],
          ['doctor', 'Doctor', 'See patients, manage schedule', 'bg-blue-50', 'text-blue-600'],
          ['hospital', 'Hospital Staff', 'Manage hospital operations', 'bg-orange-50', 'text-orange-600'],
          ['crew', 'Ambulance Staff', 'Transport & emergency care', 'bg-red-50', 'text-red-600'],
        ]
        return (
          <div className="flex-1 flex flex-col h-full bg-white">
            <StatusBar />
            <div className="px-5 pt-6 flex flex-col gap-3 flex-1">
              <div className="text-center">
                <h2 className="text-xl font-extrabold text-[#0B3B3F]">Who are you?</h2>
                <p className="text-xs text-gray-500 mt-1">We&apos;ll set up the right app for you</p>
              </div>
              {roles.map(([k, t, s, bg, fg]) => {
                const isSelected = tabState.role === k
                return (
                  <button
                    key={k}
                    onClick={() => updateTab('role', k)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left bg-white transition-all ${isSelected ? 'border-[#0F766E] ring-2 ring-teal-900/10' : 'border-gray-100'}`}
                  >
                    <div className={`w-10 h-10 rounded-xl ${bg} ${fg} flex items-center justify-center font-bold`}>
                      <User size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-sm text-gray-900">{t}</div>
                      <div className="text-xs text-gray-500">{s}</div>
                    </div>
                    {isSelected && <CheckCircle2 size={20} className="text-[#0F766E]" />}
                  </button>
                )
              })}
              <div className="flex-1" />
              <button onClick={() => navigate('p-2fa')} className="w-full h-12 rounded-xl bg-[#0F766E] text-white font-bold mb-4 shadow-md">
                Continue
              </button>
            </div>
          </div>
        )
      }

      case 'p-2fa':
        return (
          <div className="flex-1 flex flex-col h-full bg-white">
            <StatusBar />
            <div className="px-5 pt-10 flex flex-col gap-4 flex-1">
              <div className="text-center">
                <h2 className="text-xl font-extrabold text-[#0B3B3F]">Verify your identity</h2>
                <p className="text-xs text-gray-500 mt-1.5">Enter the code sent to your phone 0803…000</p>
              </div>
              <div className="flex gap-2 justify-center my-4">
                {['4', '8', '2', '7', '1', ''].map((val, idx) => (
                  <span key={idx} className={`w-10 h-12 rounded-xl border flex items-center justify-center text-lg font-bold text-[#0B3B3F] ${idx === 5 ? 'border-[#0F766E] ring-2 ring-teal-900/10' : 'border-gray-200'}`}>
                    {val}
                  </span>
                ))}
              </div>
              <button onClick={() => showToast('New code sent')} className="text-center text-xs text-[#0F766E] font-bold">
                Resend code
              </button>
              <div className="flex-1" />
              <button onClick={() => navigate('p-home')} className="w-full h-12 rounded-xl bg-[#0F766E] text-white font-bold mb-4 shadow-md">
                Verify
              </button>
            </div>
          </div>
        )

      case 'p-home':
        return (
          <div className="flex-1 flex flex-col h-full bg-gray-50">
            <Header
              title="Good morning, Emeka"
              sub="How can we help you today?"
              big
              right={
                <div className="flex items-center gap-2">
                  <button onClick={() => navigate('p-sos')} className="bg-red-500 text-white text-xs px-2.5 py-1 rounded-full font-bold">SOS</button>
                  <button onClick={() => navigate('p-notifs')} className="relative p-1">
                    <Bell size={20} />
                    <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500" />
                  </button>
                </div>
              }
            />
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => navigate('p-search')} className="p-3.5 rounded-2xl bg-white border border-gray-100 flex flex-col gap-2.5 text-left shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-[#0F766E] text-white flex items-center justify-center"><Calendar size={20} /></div>
                  <span className="font-bold text-xs text-gray-900">Book<br />Appointment</span>
                </button>
                <button onClick={() => navigate('p-virtual')} className="p-3.5 rounded-2xl bg-white border border-gray-100 flex flex-col gap-2.5 text-left shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center"><Video size={20} /></div>
                  <span className="font-bold text-xs text-gray-900">Virtual Care</span>
                  <span className="text-[10px] text-teal-600 font-medium">● 4 online</span>
                </button>
                <button onClick={() => navigate('p-amb')} className="p-3.5 rounded-2xl bg-white border border-gray-100 flex flex-col gap-2.5 text-left shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center"><Ambulance size={20} /></div>
                  <span className="font-bold text-xs text-gray-900">Ambulance</span>
                </button>
                <button onClick={() => navigate('p-mycare')} className="p-3.5 rounded-2xl bg-white border border-gray-100 flex flex-col gap-2.5 text-left shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-[#134E4A] text-white flex items-center justify-center"><Shield size={20} /></div>
                  <span className="font-bold text-xs text-gray-900">My Care</span>
                  <span className="text-[10px] text-teal-600 font-medium">2 refills due</span>
                </button>
              </div>

              <div>
                <h3 className="font-bold text-xs text-gray-800 mb-2">Upcoming Appointments</h3>
                <div className="flex flex-col gap-2">
                  <button onClick={() => navigate('p-pass')} className="w-full bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3 text-left shadow-sm">
                    <Avatar name="Funmi Bello" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs text-gray-900">Dr. Funmi Bello</div>
                      <div className="text-[11px] text-gray-500">Cardiologist</div>
                      <div className="text-[11px] text-gray-500 truncate">Today, 10:30 AM · Lekki Haven Hospital</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-teal-50 text-[#0F766E] font-bold text-xs">#3</span>
                    <ChevronRight size={16} className="text-gray-400" />
                  </button>
                  <button onClick={() => navigate('p-appts')} className="w-full bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3 text-left shadow-sm">
                    <Avatar name="Tunde Adeyemi" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs text-gray-900">Dr. Tunde Adeyemi</div>
                      <div className="text-[11px] text-gray-500">Dermatology · video visit</div>
                      <div className="text-[11px] text-gray-500 truncate">Tue 13 Oct, 4:00 PM</div>
                    </div>
                    <ChevronRight size={16} className="text-gray-400" />
                  </button>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-xs text-gray-800 mb-2">Care near you</h3>
                <button onClick={() => navigate('p-provider')} className="w-full bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3 text-left shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center"><Building2 size={20} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs text-gray-900">Cedarline Clinic</div>
                    <div className="text-[11px] text-gray-500 truncate">Ikeja · ~20 min wait · ★ 4.7</div>
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </button>
              </div>
            </div>
            <TabBar active="p-home" />
          </div>
        )

      case 'p-search':
        return (
          <div className="flex-1 flex flex-col h-full bg-gray-50">
            <Header title="Search" back="p-home" sub="Search for hospitals, doctors, specialties or care needs" />
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
              <button onClick={() => navigate('p-results')} className="flex items-center gap-2 px-3 h-12 bg-white rounded-xl border border-gray-200 text-gray-400 text-sm shadow-sm">
                <Search size={16} className="text-[#0F766E]" />
                <span>Search…</span>
              </button>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['hospital', 'By Hospital', 'Hospitals'],
                  ['user', 'By Doctor', 'Doctors'],
                  ['heart', 'By Specialty', 'Specialties'],
                  ['bandage', 'By Care Need', 'Specialties'],
                ].map(([ic, l]) => (
                  <button key={l} onClick={() => navigate('p-results')} className="p-4 rounded-2xl bg-white border border-gray-100 flex flex-col items-center justify-center gap-2 text-center shadow-sm min-h-[100px]">
                    <Search size={24} className="text-[#0F766E]" />
                    <span className="font-bold text-xs text-gray-900">{l}</span>
                  </button>
                ))}
              </div>
              <div>
                <div className="text-xs font-bold text-gray-700 mb-2">Popular care needs</div>
                <div className="flex flex-wrap gap-1.5">
                  {['Fever', 'Antenatal', 'Malaria test', 'Skin rash', 'Child check up', 'Blood pressure'].map(c => (
                    <button key={c} onClick={() => navigate('p-results')} className="px-3 py-1.5 rounded-full bg-teal-50 text-[#0F766E] text-xs font-bold">
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <TabBar active="p-home" />
          </div>
        )

      case 'p-results':
        return (
          <div className="flex-1 flex flex-col h-full bg-gray-50">
            <Header title="Results" back="p-search" />
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
              <div className="flex bg-gray-100 p-1 rounded-xl">
                {['Hospitals', 'Doctors', 'Specialties'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => updateTab('res', tab)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${tabState.res === tab ? 'bg-white text-[#0F766E] shadow-sm font-bold' : 'text-gray-500'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                {tabState.res === 'Hospitals' && [
                  ['Lekki Haven Hospital', 'Lekki Phase 1', '4.6', '212', '2.1 km', 'Open 24/7'],
                  ['Cedarline Clinic', 'Ikeja', '4.7', '148', '4.3 km', 'Open'],
                  ['Marina Specialist Hospital', 'Lagos Island', '4.5', '96', '6.8 km', 'Open'],
                ].map(([n, , r, c, d, open]) => (
                  <button key={n} onClick={() => navigate('p-provider')} className="w-full bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3 text-left shadow-sm">
                    <Avatar name={n} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs text-gray-900">{n}</div>
                      <div className="text-[11px] text-gray-500">★ {r} ({c}) · {d}</div>
                      <div className="text-[11px] text-gray-500">{open}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <TabBar active="p-home" />
          </div>
        )

      case 'p-provider':
        return (
          <div className="flex-1 flex flex-col h-full bg-gray-50">
            <Header title="" back="p-results" />
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-4 bg-white">
              <div className="flex gap-3 items-center">
                <Avatar name="Funmi Bello" bg="bg-teal-100" text="text-teal-800" />
                <div>
                  <h2 className="font-bold text-base text-gray-900">Dr. Funmi Bello</h2>
                  <p className="text-xs text-gray-500">Cardiologist</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">★ 4.8 · Lekki Haven Hospital · 2.1 km</p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">● Available today</span>
                </div>
              </div>
              <div className="flex gap-2">
                {['In person', 'Virtual'].map(m => (
                  <button
                    key={m}
                    onClick={() => updateTab('mode', m)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${tabState.mode === m ? 'border-[#0F766E] bg-teal-50 text-[#0F766E]' : 'border-gray-200 text-gray-600'}`}
                  >
                    {m === 'Virtual' ? <Video size={14} /> : <MapPin size={14} />}
                    {m}
                  </button>
                ))}
              </div>
              <button onClick={() => navigate('p-when')} className="w-full h-11 rounded-xl bg-[#0F766E] text-white font-bold shadow-md">
                Book Appointment
              </button>
              <div className="flex border-b border-gray-100">
                {['About', 'Availability', 'Reviews'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => updateTab('ptab', tab)}
                    className={`flex-1 py-2 text-xs font-semibold border-b-2 ${tabState.ptab === tab ? 'border-[#0F766E] text-[#0F766E] font-bold' : 'border-transparent text-gray-400'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {tabState.ptab === 'About' && (
                <div className="flex flex-col gap-3 text-xs text-gray-600">
                  <p className="leading-relaxed">Experienced cardiologist with 12+ years of clinical practice. Heart checks, hypertension care, ECG review and follow up for chronic heart conditions.</p>
                  <div className="flex justify-between py-1 border-b border-gray-50"><span className="text-gray-400">Consultation</span><span className="font-bold text-gray-900">₦8,000</span></div>
                  <div className="flex justify-between py-1 border-b border-gray-50"><span className="text-gray-400">Languages</span><span className="font-bold text-gray-900">English, Yoruba</span></div>
                </div>
              )}
              {tabState.ptab === 'Availability' && (
                <div className="flex flex-wrap gap-2">
                  {['Today 2:30 PM', 'Today 4:00 PM', 'Tue 9:30 AM', 'Tue 11:00 AM', 'Wed 10:00 AM'].map((s, i) => (
                    <button key={s} onClick={() => navigate('p-when')} className={`px-3 py-2 rounded-xl text-xs font-bold ${i === 0 ? 'bg-teal-50 text-[#0F766E] border border-teal-200' : 'bg-gray-100 text-gray-600'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {tabState.ptab === 'Reviews' && (
                <div className="flex flex-col gap-2">
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="text-amber-500 text-xs">★★★★★</div>
                    <p className="text-xs text-gray-700 mt-1">Short wait, very clear explanation.</p>
                    <span className="text-[10px] text-gray-400">Bisi L.</span>
                  </div>
                </div>
              )}
            </div>
            <TabBar active="p-home" />
          </div>
        )

      case 'p-when':
        return (
          <div className="flex-1 flex flex-col h-full bg-white">
            <Header title="Book · When" back="p-provider" right={<span className="text-xs bg-white/20 px-2 py-0.5 rounded">2 of 3</span>} />
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
              <div className="text-xs text-gray-500">Dr. Funmi Bello · Cardiology · {String(tabState.mode).toLowerCase()}</div>
              <div className="flex gap-1.5">
                {[['Sun', '11'], ['Mon', '12'], ['Tue', '13'], ['Wed', '14'], ['Thu', '15']].map(([a, b]) => (
                  <button key={b} onClick={() => updateTab('day', b)} className={`flex-1 rounded-xl py-2 text-center ${tabState.day === b ? 'bg-[#0F766E] text-white font-bold' : 'bg-gray-50 text-gray-700'}`}>
                    <div className="text-[10px]">{a}</div>
                    <div className="text-sm font-bold">{b}</div>
                  </button>
                ))}
              </div>
              <div className="text-[11px] font-bold text-gray-400 tracking-wider">MORNING</div>
              <div className="grid grid-cols-3 gap-2">
                {['9:30', '10:00', '11:30'].map(x => (
                  <button key={x} onClick={() => updateTab('slot', x)} className={`h-10 rounded-xl text-xs font-bold ${tabState.slot === x ? 'bg-[#0F766E] text-white' : 'border border-gray-200 text-gray-700'}`}>
                    {x}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <button onClick={() => navigate('p-paymethod')} className="w-full h-12 rounded-xl bg-[#0F766E] text-white font-bold shadow-md">
                Continue
              </button>
            </div>
          </div>
        )

      case 'p-paymethod':
        return (
          <div className="flex-1 flex flex-col h-full bg-gray-50">
            <Header title="Payment Method" back="p-when" />
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
              <div className="text-xs font-bold text-gray-700">Select payment method</div>
              {[
                ['Card', 'Saved · •••• 4821'],
                ['Apple Pay', ''],
                ['Google Pay', ''],
                ['Wallet', 'Queue Wallet · ₦12,400'],
              ].map(([n, sub]) => {
                const isSelected = tabState.pm === n
                return (
                  <button key={n} onClick={() => updateTab('pm', n)} className={`w-full bg-white p-3 rounded-xl border flex items-center gap-3 text-left shadow-sm ${isSelected ? 'border-[#0F766E]' : 'border-gray-100'}`}>
                    <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center"><CreditCard size={16} /></div>
                    <div className="flex-1">
                      <div className="font-bold text-xs text-gray-900">{n}</div>
                      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
                    </div>
                    {isSelected ? <CheckCircle2 size={18} className="text-[#0F766E]" /> : <ChevronRight size={16} className="text-gray-400" />}
                  </button>
                )
              })}
              <button onClick={() => navigate('p-addcard')} className="w-full bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3 text-left shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center"><Plus size={16} /></div>
                <div className="font-bold text-xs text-gray-900">Add new card</div>
              </button>
              <div className="flex-1" />
              <button onClick={() => navigate('p-paysum')} className="w-full h-12 rounded-xl bg-[#0F766E] text-white font-bold shadow-md">
                Continue
              </button>
            </div>
          </div>
        )

      case 'p-paysum':
        return (
          <div className="flex-1 flex flex-col h-full bg-white">
            <Header title="Payment Summary" back="p-paymethod" />
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-center gap-3">
                <Avatar name="Funmi Bello" />
                <div>
                  <div className="text-[11px] text-gray-400">Appointment with</div>
                  <div className="font-bold text-xs text-gray-900">Dr. Funmi Bello</div>
                  <div className="text-[11px] text-gray-500">Lekki Haven Hospital · Tue 9:30 AM</div>
                </div>
              </div>
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 flex flex-col gap-2">
                <div className="flex justify-between text-xs text-gray-600"><span>Consultation</span><span>₦5,000</span></div>
                <div className="flex justify-between text-xs text-gray-600"><span>Card registration</span><span>₦1,500</span></div>
                <div className="h-px bg-gray-200 my-1" />
                <div className="flex justify-between text-sm font-bold text-gray-900"><span>Total</span><span className="text-[#0F766E]">₦6,500</span></div>
              </div>
              <button onClick={() => navigate('p-paymethod')} className="w-full bg-gray-50 p-3 rounded-xl border border-gray-100 flex justify-between items-center text-left">
                <div>
                  <div className="text-[10px] text-gray-400">Payment method</div>
                  <div className="font-bold text-xs text-gray-900">{tabState.pm === 'Card' ? 'Card •••• 4821' : tabState.pm}</div>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
              <div className="flex-1" />
              <button onClick={() => navigate('p-booked')} className="w-full h-12 rounded-xl bg-[#0F766E] text-white font-bold shadow-md">
                Pay ₦6,500
              </button>
            </div>
          </div>
        )

      case 'p-booked':
        return (
          <div className="flex-1 flex flex-col h-full bg-white">
            <StatusBar />
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Check size={40} strokeWidth={2.5} />
              </div>
              <h2 className="text-2xl font-extrabold text-[#0B3B3F]">You&apos;re booked!</h2>
              <p className="text-xs text-gray-500">Tue 13 Oct · {tabState.slot} AM · Dr. Bello</p>
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">Receipt sent on WhatsApp</span>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <button onClick={() => showToast('Added to calendar')} className="w-full bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-center gap-3 text-left">
                <Calendar size={16} className="text-[#0F766E]" />
                <span className="font-bold text-xs text-gray-900">Add to calendar</span>
              </button>
              <button onClick={() => navigate('p-pass')} className="w-full h-12 rounded-xl bg-[#0F766E] text-white font-bold shadow-md mt-2">
                View Queue Pass
              </button>
            </div>
          </div>
        )

      case 'p-pass':
        return (
          <div className="flex-1 flex flex-col h-full bg-gradient-to-b from-[#134E4A] to-[#0B3B3F] text-white">
            <StatusBar />
            <div className="flex items-center gap-2 px-4 py-2 font-bold text-lg">
              <button onClick={() => navigate('p-home')}><ChevronRight className="rotate-180" size={20} /></button>
              <span>Queue Pass</span>
              <span className="flex-1" />
              <span className="text-[10px] bg-[#14B8A6] text-[#06302D] px-2 py-0.5 rounded-full">● LIVE</span>
            </div>
            <div className="m-4 bg-white text-gray-900 rounded-2xl p-4 flex flex-col gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <Avatar name="Funmi Bello" />
                <div>
                  <div className="font-bold text-xs">Dr. Funmi Bello</div>
                  <div className="text-[11px] text-gray-500">Cardiology · Consulting Room 4</div>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <div className="text-5xl font-extrabold text-[#0F766E]">3</div>
                <div>
                  <div className="font-bold text-xs">in line</div>
                  <div className="text-[11px] text-gray-500">about 12 min</div>
                </div>
              </div>
              <div className="flex gap-1">
                {['Booked', 'Arrived', 'Vitals', 'With doctor', 'Done'].map((x, i) => (
                  <div key={x} className="flex-1">
                    <div className={`h-1.5 rounded-full ${i < 3 ? 'bg-[#0F766E]' : 'bg-gray-200'}`} />
                    <div className={`text-[9px] mt-1 ${i < 3 ? 'text-[#0F766E]' : 'text-gray-400'}`}>{x}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 border-t border-dashed border-gray-200 pt-3">
                <QrCode size={50} className="text-gray-900" />
                <div>
                  <div className="text-[10px] text-gray-400 font-bold">PATIENT ID</div>
                  <div className="font-extrabold text-base">QP-7K4M</div>
                  <div className="text-[10px] text-gray-500">Show at front desk</div>
                </div>
              </div>
            </div>
            <div className="flex-1" />
            <div className="p-4">
              <button onClick={() => navigate('p-turn')} className="w-full h-12 rounded-xl bg-[#14B8A6] text-[#06302D] font-bold shadow-md">
                Simulate call in
              </button>
            </div>
          </div>
        )

      case 'p-turn':
        return (
          <div className="flex-1 flex flex-col h-full bg-gradient-to-b from-[#18978C] via-[#0F766E] to-[#0B4B4A] text-white">
            <StatusBar />
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
              <div className="w-28 h-28 rounded-full bg-white/15 flex items-center justify-center shadow-xl ring-8 ring-white/10">
                <Bell size={48} />
              </div>
              <h2 className="text-3xl font-extrabold">It&apos;s your turn</h2>
              <p className="text-sm opacity-90">Dr. Funmi Bello is ready for you</p>
              <span className="px-4 py-1.5 rounded-full bg-white text-[#0F766E] text-xs font-bold shadow-sm">
                Consulting Room 4
              </span>
            </div>
            <div className="p-5">
              <button onClick={() => navigate('p-home')} className="w-full h-12 rounded-xl bg-white text-[#0F766E] font-bold shadow-md">
                I&apos;m coming
              </button>
            </div>
          </div>
        )

      case 'p-virtual':
        return (
          <div className="flex-1 flex flex-col h-full bg-gray-50">
            <Header title="Virtual Care" back="p-home" right={<span className="text-[10px] bg-teal-800/30 text-teal-200 px-2 py-0.5 rounded-full">● 4 online</span>} />
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-4 bg-white">
              <div className="flex justify-center my-2">
                <div className="w-48 h-28 bg-teal-50 rounded-2xl flex items-center justify-center text-[#0F766E]">
                  <Video size={40} />
                </div>
              </div>
              <div className="text-center">
                <h2 className="font-extrabold text-base text-[#0B3B3F]">Get care from anywhere</h2>
                <p className="text-xs text-gray-500 mt-1">Connect with trusted healthcare professionals via video, audio or chat.</p>
              </div>
              <div className="flex bg-gray-100 p-1 rounded-xl">
                {['Video', 'Audio', 'Chat'].map(m => (
                  <button
                    key={m}
                    onClick={() => updateTab('vmode', m)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${tabState.vmode === m ? 'bg-white text-[#0F766E] shadow-sm font-bold' : 'text-gray-500'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <button onClick={() => navigate(tabState.vmode === 'Chat' ? 'p-chat' : 'p-video')} className="w-full h-12 rounded-xl bg-[#0F766E] text-white font-bold shadow-md">
                Start a Virtual Visit
              </button>
            </div>
            <TabBar active="p-home" />
          </div>
        )

      case 'p-video':
        return (
          <div className="flex-1 flex flex-col h-full bg-[#0E4A4A] text-white">
            <StatusBar />
            <div className="px-4 py-2 font-bold text-base">Video Consultation</div>
            <div className="flex-1 m-3 rounded-2xl bg-teal-900 relative overflow-hidden flex items-center justify-center">
              <User size={80} className="text-teal-700/50" />
              <div className="absolute top-2 right-2 w-16 h-20 bg-gray-800 rounded-lg border border-white/20 flex items-center justify-center text-xs">
                You
              </div>
              <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-500 rounded text-[10px] font-bold">● 04:12</div>
            </div>
            <div className="flex justify-center gap-6 py-4">
              <button onClick={() => showToast('Microphone muted')} className="w-12 h-12 rounded-full bg-teal-900 flex items-center justify-center"><Mic size={20} /></button>
              <button onClick={() => showToast('Switched to audio only')} className="w-12 h-12 rounded-full bg-teal-900 flex items-center justify-center"><Video size={20} /></button>
              <button onClick={() => navigate('p-rate')} className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center"><PhoneOff size={20} /></button>
            </div>
            <div className="text-center pb-4">
              <div className="font-bold text-xs">Dr. Funmi Bello</div>
              <div className="text-[11px] opacity-75">Cardiologist</div>
            </div>
          </div>
        )

      case 'p-amb':
        return (
          <div className="flex-1 flex flex-col h-full bg-gray-50">
            <Header title="Ambulance Services" back="p-home" />
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
              <button onClick={() => navigate('p-sos')} className="w-full bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-3 text-left shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center"><Ambulance size={20} /></div>
                <div className="flex-1">
                  <div className="font-bold text-sm text-gray-900">Emergency Transport</div>
                  <div className="text-xs text-gray-500">Immediate response</div>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
              <button onClick={() => navigate('p-amb-req')} className="w-full bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-3 text-left shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><Calendar size={20} /></div>
                <div className="flex-1">
                  <div className="font-bold text-sm text-gray-900">Scheduled Transport</div>
                  <div className="text-xs text-gray-500">Non emergency: discharge, dialysis, follow up</div>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
              <div className="bg-red-50 border border-red-100 p-3 rounded-xl flex items-center gap-2 text-xs text-red-900">
                <Phone size={16} className="text-red-600" />
                <span>No signal? Call <b>112</b> or Lagos <b>767</b></span>
              </div>
            </div>
            <TabBar active="p-home" />
          </div>
        )

      case 'p-sos':
        return (
          <div className="flex-1 flex flex-col h-full bg-red-600 text-white">
            <StatusBar />
            <div className="flex items-center gap-2 px-4 py-2 font-bold text-xs tracking-wider">
              <button onClick={() => navigate('p-amb')}><X size={18} /></button>
              <span>EMERGENCY</span>
            </div>
            <div className="flex justify-center gap-2 py-2">
              {['Me', 'Ada', 'Someone else'].map(w => (
                <button key={w} onClick={() => updateTab('who', w)} className={`px-3 py-1 rounded-full text-xs font-bold ${tabState.who === w ? 'bg-white text-red-600' : 'bg-white/20 text-white'}`}>
                  {w}
                </button>
              ))}
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <button onClick={() => navigate('p-triage')} className="w-48 h-48 rounded-full bg-gradient-to-br from-red-400 to-red-700 text-white font-extrabold text-xl shadow-2xl flex flex-col items-center justify-center border-4 border-white/30">
                HOLD
                <span className="text-xs font-medium opacity-90 mt-1">2 seconds</span>
              </button>
              <div className="text-xs text-red-100 flex items-center gap-1.5 mt-6">
                <MapPin size={14} /> Admiralty Way, Lekki · ±12 m
              </div>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <button onClick={() => navigate('p-amb-req')} className="w-full h-11 bg-white/20 rounded-xl font-bold text-xs">
                I can get there myself
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => showToast('Calling 112')} className="h-11 bg-white text-red-600 rounded-xl font-bold text-xs">Call 112</button>
                <button onClick={() => showToast('Calling 767')} className="h-11 bg-white text-red-600 rounded-xl font-bold text-xs">Lagos 767</button>
              </div>
            </div>
          </div>
        )

      case 'p-mycare':
        return (
          <div className="flex-1 flex flex-col h-full bg-gray-50">
            <Header title="My Care" back="p-home" />
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-2">
              {[
                ['calendar', 'Appointments', 'View & manage', 'p-appts'],
                ['file', 'Medical Records', 'Test results & history', 'p-records'],
                ['pill', 'Prescriptions', 'View & refill', 'p-rx'],
                ['heartPulse', 'Care Plans', 'Personalized care', 'p-careplan'],
                ['clipboard', 'Health Profile', 'Allergies, conditions, family history', 'p-healthprofile'],
              ].map(([, t, s, g]) => (
                <button key={t} onClick={() => navigate(g)} className="w-full bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3 text-left shadow-sm">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center"><Calendar size={18} /></div>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-gray-900">{t}</div>
                    <div className="text-[11px] text-gray-500">{s}</div>
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </button>
              ))}
            </div>
            <TabBar active="p-home" />
          </div>
        )

      case 'p-appts':
        return (
          <div className="flex-1 flex flex-col h-full bg-gray-50">
            <Header title="Appointments" back="p-mycare" />
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
              <div className="flex bg-gray-100 p-1 rounded-xl">
                {['Upcoming', 'Past'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => updateTab('ap', tab)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${tabState.ap === tab ? 'bg-white text-[#0F766E] shadow-sm font-bold' : 'text-gray-500'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <div className="bg-white p-3 rounded-xl border border-gray-100 flex gap-3">
                  <Avatar name="Funmi Bello" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between">
                      <span className="font-bold text-xs text-gray-900">Dr. Funmi Bello</span>
                      <span className="px-2 py-0.5 rounded-full bg-teal-50 text-[#0F766E] text-[10px] font-bold">Checked in</span>
                    </div>
                    <div className="text-[11px] text-gray-500">Cardiologist</div>
                    <div className="text-xs font-bold text-gray-900 mt-1">Today · 10:30 AM</div>
                    <button onClick={() => navigate('p-pass')} className="mt-2 px-3 py-1 rounded-full bg-teal-50 text-[#0F766E] text-xs font-bold">
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <TabBar active="p-appts" />
          </div>
        )

      case 'p-profile':
        return (
          <div className="flex-1 flex flex-col h-full bg-gray-50">
            <Header title="Profile" />
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-2">
              <div className="bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3">
                <Avatar name="Emeka Okafor" bg="bg-teal-100" text="text-teal-800" />
                <div>
                  <div className="font-bold text-sm text-gray-900">Emeka Okafor</div>
                  <div className="text-xs text-gray-500">Patient ID QP-7K4M · +234 803 000 0000</div>
                </div>
              </div>
              {[
                ['card', 'Payment methods', 'Card •••• 4821 · Wallet ₦12,400', 'p-paymethod'],
                ['users', 'Family', 'Ada (daughter)', 'p-family'],
                ['clipboard', 'Health profile', 'Allergies, conditions', 'p-healthprofile'],
                ['bell', 'Notification channels', 'Push, WhatsApp, SMS', 'p-perms'],
                ['headset', 'Help & Queue Support', 'Chat with us', 'p-chat'],
              ].map(([, t, s, g]) => (
                <button key={t} onClick={() => navigate(g)} className="w-full bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3 text-left shadow-sm">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center"><User size={16} /></div>
                  <div className="flex-1">
                    <div className="font-bold text-xs text-gray-900">{t}</div>
                    <div className="text-[11px] text-gray-500">{s}</div>
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </button>
              ))}
              <button onClick={() => navigate('p-splash')} className="w-full h-11 rounded-xl bg-gray-100 text-gray-700 font-bold text-xs mt-2">
                Sign out
              </button>
            </div>
            <TabBar active="p-profile" />
          </div>
        )

      default:
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <h3 className="font-bold text-base text-gray-800 mb-2">Screen: {currentScreen}</h3>
            <p className="text-xs text-gray-500 mb-4">This screen is part of the Queue ecosystem.</p>
            <button onClick={() => navigate('p-home')} className="px-4 py-2 bg-[#0F766E] text-white rounded-xl text-xs font-bold">
              Return Home
            </button>
          </div>
        )
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900 p-4 font-sans">
      <div className="relative bg-[#121A1C] rounded-[46px] p-3 shadow-2xl border-2 border-gray-800 w-[360px] h-[760px] flex flex-col overflow-hidden">
        <div className="rounded-[36px] overflow-hidden relative bg-white flex-1 flex flex-col">
          {renderScreenContent()}
          {toastMessage && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-[#0B3B3F] text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg z-50 animate-bounce">
              {toastMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
