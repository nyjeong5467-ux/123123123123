import { type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Home } from './pages/Home'
import { Dashboard } from './pages/Dashboard'
import { SchoolsHub } from './pages/SchoolsHub'
import { SchoolDetail } from './pages/SchoolDetail'
import { Login } from './pages/Login'
import { Ops } from './pages/Ops'
import { Accidents } from './pages/Accidents'
import { Inspection } from './pages/Inspection'
import { InspectionForm } from './pages/InspectionForm'
import { Risk } from './pages/Risk'
import { Musculo } from './pages/Musculo'
import { MusculoReport } from './pages/MusculoReport'
import { Education } from './pages/Education'
import { Compliance } from './pages/Compliance'
import { Billing } from './pages/Billing'
import { Sessions } from './pages/Sessions'
import { MyPage } from './pages/MyPage'
import { SettingsPage } from './pages/SettingsPage'
import { Accounts } from './pages/Accounts'
import { Mail } from './pages/Mail'
import { Resources } from './pages/Resources'
import { useAuth } from './lib/auth'

function Protected({ children }: { children: ReactNode }) {
  const { authed } = useAuth()
  return authed ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <Protected>
              <AppShell>
                <Outlet />
              </AppShell>
            </Protected>
          }
        >
          <Route path="/" element={<Home />} />
          <Route path="/ledger" element={<Dashboard />} />
          <Route path="/schools" element={<SchoolsHub />} />
          <Route path="/schools/:id" element={<SchoolDetail />} />
          <Route path="/schools-status" element={<Navigate to="/schools" replace />} />
          <Route path="/ops" element={<Ops />} />
          <Route path="/accidents" element={<Accidents />} />
          <Route path="/inspection" element={<Inspection />} />
          <Route path="/inspection/new" element={<InspectionForm />} />
          <Route path="/risk" element={<Risk />} />
          <Route path="/musculo" element={<Musculo />} />
          <Route path="/musculo/report" element={<MusculoReport />} />
          <Route path="/education" element={<Education />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/mypage" element={<MyPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/mail" element={<Mail />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
