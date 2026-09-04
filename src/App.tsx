// Rotas. Cada tela é carregada sob demanda (`lazy`): quem abre o app no 4G do canteiro
// baixa a tela que vai usar, não as catorze. O técnico, que só usa /meu-roteiro, para de
// pagar pelo peso do planejamento, da expedição e do histórico.
import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { DataProvider } from './hooks/useData'
import { ToastProvider } from './hooks/useToast'
import { PrintProvider } from './components/Print'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Carregando } from './components/ui'

// O `lazy` precisa de export default; as telas exportam nomeado, daí o `.then`.
const tela = <T extends string>(carregar: () => Promise<Record<T, React.ComponentType>>, nome: T) =>
  lazy(() => carregar().then(m => ({ default: m[nome] })))

const Dashboard = tela(() => import('./pages/Dashboard'), 'Dashboard')
const MeuRoteiro = tela(() => import('./pages/MeuRoteiro'), 'MeuRoteiro')
const Fila = tela(() => import('./pages/Fila'), 'Fila')
const Planejamento = tela(() => import('./pages/Planejamento'), 'Planejamento')
const PreRoteiro = tela(() => import('./pages/PreRoteiro'), 'PreRoteiro')
const Expedicao = tela(() => import('./pages/Expedicao'), 'Expedicao')
const PreCarga = tela(() => import('./pages/PreCarga'), 'PreCarga')
const Roteiro = tela(() => import('./pages/Roteiro'), 'Roteiro')
const ImpTecnico = tela(() => import('./pages/ImpTecnico'), 'ImpTecnico')
const Pendencias = tela(() => import('./pages/Pendencias'), 'Pendencias')
const Tecnicos = tela(() => import('./pages/Tecnicos'), 'Tecnicos')
const Cadastros = tela(() => import('./pages/Cadastros'), 'Cadastros')
const Historico = tela(() => import('./pages/Historico'), 'Historico')
const Arquivo = tela(() => import('./pages/Arquivo'), 'Arquivo')

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
          <Route path="arquivo" element={<Arquivo />} />
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
            {/* O Suspense fica dentro dos provedores: trocar de tela não pode
                desmontar os dados nem a sessão. */}
            <Suspense fallback={<Carregando texto="Abrindo…" />}>
              <Protegido />
            </Suspense>
          </AuthProvider>
        </PrintProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
