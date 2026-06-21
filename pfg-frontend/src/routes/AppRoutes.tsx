import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import {
  DashboardPage,
  HomePage,
  LoginPage,
  ResultPage,
  StartEvaluationPage,
} from '../pages'
import { ProtectedRoute } from './ProtectedRoute'
import { PublicOnlyRoute } from './PublicOnlyRoute'

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/evaluation" element={<StartEvaluationPage />} />
          <Route path="/result" element={<ResultPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
