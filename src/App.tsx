import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { DataProvider } from './hooks/useData'
import { ToastProvider } from './hooks/useToast'
import { PrintProvider } from './components/Print'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { MeuRoteiro } from './pages/MeuRoteiro'
import { Fila } from './pages/Fila'
import { Planejamento } from './pages/Planejamento'
import { PreRoteiro } from './pages/PreRoteiro'
import { Expedicao } from './pages/Expedicao'
import { PreCarga } from './pages/PreCarga'
import { Roteiro } from './pages/Roteiro'
import { ImpTecnico } from './pages/ImpTecnico'
import { Pendencias } from './pages/Pendencias'
import { Tecnicos } from './pages/Tecnicos'
import { Cadastros } from './pages/Cadastros'
import { Historico } from './pages/Historico'
import { Carregando } from './components/ui'

function Protegido() {
  const { usuario, carregando } = useAuth()
  if (carregando) return <Carregando texto="Verificando sessão…" />
  if (!usuario) return <Login />
  // O técnico abre o app já no roteiro dele. O dashboard é ferramenta de quem administra.
  const tecnico = usuario.perfil.papel === 'TECNICO'
  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={tecnico ? <Navigate to="/meu-roteiro" replace /> : <Dashboard />} />
          <Route path="meu-roteiro" element={<MeuRoteiro />} />
          <Route path="fila" element={<Fila />} />
          <Route path="planejamento" element={<Planejamento />} />
          <Route path="pre-roteiro" element={<PreRoteiro />} />
          <Route path="expedicao" element={<Expedicao />} />
          <Route path="pre-carga" element={<PreCarga />} />
          <Route path="roteiro" element={<Roteiro />} />
          <Route path="imp-tecnico" element={<ImpTecnico />} />
          <Route path="pendencias" element={<Pendencias />} />
          <Route path="tecnicos" element={<Tecnicos />} />
          <Route path="cadastros" element={<Cadastros />} />
          <Route path="historico" element={<Historico />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <PrintProvider>
          <AuthProvider>
            <Protegido />
          </AuthProvider>
        </PrintProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
