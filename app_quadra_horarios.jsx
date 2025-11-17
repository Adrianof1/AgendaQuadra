import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot,
  query,
  where,
  deleteDoc,
  doc,
  getDocs
} from 'firebase/firestore';
import { setLogLevel } from 'firebase/firestore';

// --- Variáveis Globais ---
let app, db, auth;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Configurações do App
const PRECO_POR_BLOCO_30_MIN = 135 / 2; // R$ 67.50
const HORA_INICIO = 8; // 8:00
const HORA_FIM = 22; // 22:00

// --- Componente Principal: App ---
export default function App() {
  const [user, setUser] = useState(null);
  const [userInfo, setUserInfo] = useState(null); // Estado para guardar o cargo
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    // Configuração do Firebase
    const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');

    if (!firebaseConfig.apiKey) {
      console.error("Configuração do Firebase não encontrada.");
      setLoadingAuth(false);
      setIsAuthReady(true);
      return;
    }

    try {
      if (!app) {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        setLogLevel('Debug');
      }
    } catch (e) {
      console.error("Erro ao inicializar Firebase:", e);
      setLoadingAuth(false);
      setIsAuthReady(true);
      return;
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Erro na autenticação inicial:", err);
      }
    };
    initAuth();

    // Observador de estado de autenticação
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser && !currentUser.isAnonymous) {
        setUser(currentUser);
        setUserId(currentUser.uid);
        
        // **LÓGICA ADMIN: Buscar o cargo do usuário**
        const userRolesCollectionPath = `/artifacts/${appId}/public/data/user_roles`;
        const q = query(collection(db, userRolesCollectionPath), where("uid", "==", currentUser.uid));
        
        try {
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const userData = querySnapshot.docs[0].data();
            setUserInfo({ ...userData, id: querySnapshot.docs[0].id });
          } else {
            // Se não houver cargo (ex: registro antigo), assume "customer"
            setUserInfo({ uid: currentUser.uid, email: currentUser.email, role: 'customer' });
          }
        } catch (err) {
          console.error("Erro ao buscar cargo do usuário:", err);
          // Em caso de erro, assume "customer" por segurança
          setUserInfo({ uid: currentUser.uid, email: currentUser.email, role: 'customer' });
        }
        setIsAuthReady(true);
        
      } else {
        // Usuário deslogado ou anônimo
        setUser(null);
        setUserId(null);
        setUserInfo(null); // Limpar dados do usuário
        setIsAuthReady(true); // Pronto para mostrar tela de login
        if (currentUser && currentUser.isAnonymous) {
           setUser(null); // Força o login/registro
        }
      }
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  if (loadingAuth || !isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <Spinner />
        <span className="ml-4 text-xl text-gray-300">Carregando...</span>
      </div>
    );
  }

  // **LÓGICA DE ROTEAMENTO ATUALIZADA**
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      <div className="flex-grow">
        {user && userInfo ? (
          <>
            {userInfo.role === 'admin' ? (
              <AdminDashboard user={user} userId={userId} />
            ) : (
              <SchedulerScreen user={user} userId={userId} />
            )}
          </>
        ) : (
          <AuthScreen />
        )}
      </div>
      
      {/* --- RODAPÉ --- */}
      <footer className="text-center py-6 mt-8 text-sm text-gray-500 border-t border-gray-700">
        App feito por {" "} 
        <a 
          href="https://www.linkedin.com/in/adriano-ferreira-8b227b11b/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="font-medium text-green-400 hover:text-green-300 transition-colors"
        >
          Adriano Ferreira
        </a>
      </footer>
      {/* --- FIM RODAPÉ --- */}
    </div>
  );
}

// --- Componente: Tela de Autenticação (Login/Cadastro) ---
function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (!auth) {
      setError("Serviço de autenticação não está pronto. Recarregue a página.");
      setLoading(false);
      return;
    }
    
    const userRolesCollectionPath = `/artifacts/${appId}/public/data/user_roles`;

    try {
      if (isLogin) {
        // --- Login ---
        await signInWithEmailAndPassword(auth, email, password);
        // O onAuthStateChanged no App vai cuidar do resto
      } else {
        // --- Cadastro ---
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // **LÓGICA ADMIN: Criar o cargo (role) para o novo usuário**
        await addDoc(collection(db, userRolesCollectionPath), {
          uid: user.uid,
          email: user.email,
          role: 'customer' // Todo novo usuário é 'customer' por padrão
        });
        
        setMessage("Cadastro realizado com sucesso! Você já está logado.");
      }
    } catch (err) {
      console.error("Erro de autenticação:", err);
      let friendlyMessage = err.message;
      if (err.code === 'auth/weak-password') {
        friendlyMessage = 'A senha é muito fraca. Use pelo menos 6 caracteres.';
      } else if (err.code === 'auth/email-already-in-use') {
        friendlyMessage = 'Este e-mail já está cadastrado. Tente fazer login.';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        friendlyMessage = 'E-mail ou senha inválidos.';
      }
      setError(friendlyMessage);
    }
    setLoading(false);
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setError("Por favor, digite seu e-mail no campo acima para redefinir a senha.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Link para redefinição de senha enviado para o seu e-mail.");
    } catch (err) {
      console.error("Erro ao redefinir senha:", err);
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center text-green-400">
          AgendaQuadra
        </h1>
        <h2 className="text-xl font-bold text-center text-white">
          {isLogin ? 'Login' : 'Cadastro'}
        </h2>
        
        {error && <div className="p-3 bg-red-800 text-red-100 rounded-lg text-center">{error}</div>}
        {message && <div className="p-3 bg-blue-800 text-blue-100 rounded-lg text-center">{message}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input label="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <Button type="submit" loading={loading} className="w-full">
            {loading ? 'Processando...' : (isLogin ? 'Entrar' : 'Cadastrar')}
          </Button>
        </form>
        
        <div className="text-sm text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="font-medium text-green-400 hover:text-green-300"
          >
            {isLogin ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Faça login'}
          </button>
        </div>
        
        <div className="text-sm text-center">
          <button
            onClick={handlePasswordReset}
            className="font-medium text-gray-400 hover:text-gray-300"
          >
            Esqueceu a senha?
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Componente: Tela Principal de Agendamento ---
function SchedulerScreen({ user, userId }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [allBookings, setAllBookings] = useState(new Map()); // Mapa de slot -> { userId, ... }
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  // Estado para o modal de confirmação
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, message: '' });
  // NOVO: Estado para o modal de pagamento
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const bookingsCollectionPath = `/artifacts/${appId}/public/data/bookings`;

  // Gera os horários (ex: "08:00", "08:30")
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let h = HORA_INICIO; h < HORA_FIM; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`);
      slots.push(`${String(h).padStart(2, '0')}:30`);
    }
    return slots;
  }, []);

  // Busca agendamentos em tempo real
  useEffect(() => {
    if (!db || !userId || !selectedDate) return;

    setLoading(true);
    const q = query(
      collection(db, bookingsCollectionPath),
      where("date", "==", selectedDate)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingsMap = new Map();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        bookingsMap.set(data.slot, { ...data, id: doc.id });
      });
      setAllBookings(bookingsMap);
      setLoading(false);
    }, (err) => {
      console.error("Erro ao buscar agendamentos:", err);
      setError("Não foi possível carregar os agendamentos.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db, userId, selectedDate, bookingsCollectionPath]);

  // Filtra "meus" agendamentos
  const myBookings = useMemo(() => {
    return Array.from(allBookings.values())
      .filter(booking => booking.userId === userId)
      .sort((a, b) => a.slot.localeCompare(b.slot));
  }, [allBookings, userId]);

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setSelectedSlots([]); // Limpa seleção ao trocar de data
    setError(null);
    setMessage(null);
  };

  const handleSelectSlot = (slot) => {
    if (allBookings.has(slot)) {
      setError("Este horário já está reservado.");
      return;
    }
    
    setSelectedSlots(prev => 
      prev.includes(slot) 
        ? prev.filter(s => s !== slot) 
        : [...prev, slot]
    );
    setError(null);
  };

  // MUDANÇA: Botão agora abre o modal de pagamento
  const handleOpenPaymentModal = () => {
    if (selectedSlots.length === 0) {
      setError("Selecione pelo menos um horário.");
      return;
    }
    setError(null);
    setPaymentModalOpen(true);
  };
  
  // NOVO: Função chamada pelo modal de pagamento após sucesso
  const handleBookingSuccess = (paymentMethod, paymentStatus) => {
    setPaymentModalOpen(false);
    setMessage(`Reserva confirmada! Pagamento (${paymentMethod}) ${paymentStatus}.`);
    setSelectedSlots([]);
  };

  const handleDeleteBooking = (bookingId) => {
    setConfirmModal({
      isOpen: true,
      message: 'Tem certeza que deseja cancelar este agendamento?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, bookingsCollectionPath, bookingId));
          setMessage("Agendamento cancelado com sucesso.");
        } catch (err) {
          console.error("Erro ao cancelar agendamento:", err);
          setError("Não foi possível cancelar o agendamento.");
        }
      }
    });
  };

  const totalReserva = (selectedSlots.length * PRECO_POR_BLOCO_30_MIN).toFixed(2);

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 p-4 bg-gray-800 rounded-lg shadow-lg">
        <div>
          <h1 className="text-3xl font-bold text-green-400">AgendaQuadra</h1>
          <p className="text-gray-300">Bem-vindo, <span className="font-semibold">{user.email}</span></p>
          <p className="text-sm text-gray-400">Seu ID de usuário: {userId}</p>
        </div>
        <button
          onClick={() => signOut(auth)}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition duration-200"
        >
          Sair
        </button>
      </header>

      {/* Mensagens */}
      {error && <div className="p-3 mb-4 bg-red-800 text-red-100 rounded-lg text-center" onClick={() => setError(null)}>{error} (clique para fechar)</div>}
      {message && <div className="p-3 mb-4 bg-blue-800 text-blue-100 rounded-lg text-center" onClick={() => setMessage(null)}>{message} (clique para fechar)</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Coluna de Agendamento */}
        <div className="md:col-span-2 p-6 bg-gray-800 rounded-lg shadow-lg">
          <h2 className="text-2xl font-semibold mb-4 text-white">Fazer Agendamento</h2>
          <label htmlFor="date-picker" className="block text-sm font-medium text-gray-300 mb-2">
            Selecione o Dia:
          </label>
          <input
            type="date"
            id="date-picker"
            value={selectedDate}
            onChange={handleDateChange}
            className="w-full p-2 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-400"
          />

          <h3 className="text-xl font-semibold mt-6 mb-4 text-white">Horários Disponíveis</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {timeSlots.map(slot => {
              const isBooked = allBookings.has(slot);
              const isSelected = selectedSlots.includes(slot);
              const isMyBooking = isBooked && allBookings.get(slot).userId === userId;
              
              let className = "p-3 rounded-lg text-center font-semibold transition duration-200 ";
              
              if (isBooked) {
                if (isMyBooking) {
                  className += "bg-green-700 text-green-100 cursor-not-allowed opacity-80";
                } else {
                  className += "bg-red-800 text-red-200 line-through cursor-not-allowed opacity-60";
                }
              } else if (isSelected) {
                className += "bg-green-500 text-white ring-2 ring-offset-2 ring-offset-gray-800 ring-green-400 cursor-pointer";
              } else {
                className += "bg-gray-700 text-gray-200 hover:bg-gray-600 cursor-pointer";
              }

              return (
                <div 
                  key={slot}
                  className={className}
                  onClick={() => handleSelectSlot(slot)}
                >
                  {slot}
                  {isMyBooking && <span className="block text-xs">(Seu)</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Coluna da Reserva e Meus Horários */}
        <div className="space-y-6">
          {/* Resumo da Seleção */}
          {selectedSlots.length > 0 && (
            <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
              <h3 className="text-xl font-semibold mb-4 text-white">Resumo da Reserva</h3>
              <div className="space-y-2 mb-4">
                {selectedSlots.sort().map(slot => (
                  <div key={slot} className="flex justify-between items-center bg-gray-700 p-2 rounded">
                    <span className="text-gray-200">{selectedDate}</span>
                    <span className="font-bold text-green-400">{slot}</span>
                    <span className="text-gray-300">R$ {PRECO_POR_BLOCO_30_MIN.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <hr className="border-gray-600 my-4" />
              <div className="flex justify-between items-center text-lg font-bold">
                <span className="text-white">TOTAL:</span>
                <span className="text-green-400">R$ {totalReserva}</span>
              </div>
              {/* MUDANÇA: Botão agora chama o modal */}
              <Button onClick={handleOpenPaymentModal} loading={loading} className="mt-4 w-full">
                Ir para Pagamento
              </Button>
            </div>
          )}

          {/* Meus Agendamentos */}
          <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold mb-4 text-white">Meus Agendamentos ({selectedDate})</h3>
            {myBookings.length > 0 ? (
              <ul className="space-y-2">
                {myBookings.map(booking => (
                  <li key={booking.id} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg">
                    <div>
                      <span className="font-bold text-green-300">{booking.slot}</span>
                      <span className="text-sm text-gray-400 ml-2">(R$ {booking.price.toFixed(2)})</span>
                      {/* NOVO: Mostra status do pagamento */}
                      <span className={`text-xs ml-2 px-2 py-0.5 rounded-full ${booking.paymentStatus === 'pago' ? 'bg-green-600 text-green-100' : 'bg-yellow-600 text-yellow-100'}`}>
                        {booking.paymentMethod === 'local' ? 'Pagar no local' : booking.paymentStatus}
                      </span>
                    </div>
                    <button 
                      onClick={() => handleDeleteBooking(booking.id)}
                      className="text-xs text-red-400 hover:text-red-300 font-semibold"
                    >
                      Cancelar
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400">Você não possui agendamentos para este dia.</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Modal de Confirmação */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={() => {
          if (confirmModal.onConfirm) confirmModal.onConfirm();
          setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }}
        onCancel={() => setConfirmModal({ isOpen: false, onConfirm: null, message: '' })}
      />
      
      {/* NOVO: Modal de Pagamento */}
      <PaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        selectedSlots={selectedSlots}
        selectedDate={selectedDate}
        totalAmount={parseFloat(totalReserva)}
        user={user}
        userId={userId}
        onBookingSuccess={handleBookingSuccess}
      />
    </div>
  );
}


// --- NOVO COMPONENTE: Painel do Administrador ---
function AdminDashboard({ user, userId }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [allBookings, setAllBookings] = useState([]); // Array de bookings
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  // Estado para o modal de confirmação
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, message: '' });

  // Caminho da coleção pública no Firestore
  const bookingsCollectionPath = `/artifacts/${appId}/public/data/bookings`;

  // Efeito para buscar agendamentos em tempo real
  useEffect(() => {
    if (!db || !userId || !selectedDate) return;

    setLoading(true);
    const q = query(
      collection(db, bookingsCollectionPath),
      where("date", "==", selectedDate)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingsData = [];
      snapshot.docs.forEach(doc => {
        bookingsData.push({ ...doc.data(), id: doc.id });
      });
      // Ordena por horário
      bookingsData.sort((a, b) => a.slot.localeCompare(b.slot));
      setAllBookings(bookingsData);
      setLoading(false);
    }, (err) => {
      console.error("Erro ao buscar agendamentos:", err);
      setError("Não foi possível carregar os agendamentos.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db, userId, selectedDate, bookingsCollectionPath]);

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setError(null);
    setMessage(null);
  };
  
  const handleDeleteBooking = (bookingId) => {
    setConfirmModal({
      isOpen: true,
      message: 'ADMIN: Tem certeza que deseja cancelar este agendamento? O usuário NÃO será notificado.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, bookingsCollectionPath, bookingId));
          setMessage("Agendamento (ADMIN) cancelado com sucesso.");
        } catch (err) {
          console.error("Erro ao cancelar agendamento:", err);
          setError("Não foi possível cancelar o agendamento.");
        }
      }
    });
  };

  const totalRevenue = allBookings.reduce((acc, booking) => 
    booking.paymentStatus === 'pago' ? acc + booking.price : acc
  , 0);
  const pendingRevenue = allBookings.reduce((acc, booking) =>
    booking.paymentStatus === 'pendente' ? acc + booking.price : acc
  , 0);


  return (
    <div className="container mx-auto p-4 max-w-6xl">
      {/* Header Admin */}
      <header className="flex justify-between items-center mb-6 p-4 bg-gray-800 rounded-lg shadow-lg border-l-4 border-yellow-400">
        <div>
          <h1 className="text-3xl font-bold text-yellow-400">Painel do Administrador</h1>
          <p className="text-gray-300">Logado como: <span className="font-semibold">{user.email}</span></p>
        </div>
        <button
          onClick={() => signOut(auth)}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition duration-200"
        >
          Sair
        </button>
      </header>

      {/* Mensagens */}
      {error && <div className="p-3 mb-4 bg-red-800 text-red-100 rounded-lg text-center">{error}</div>}
      {message && <div className="p-3 mb-4 bg-blue-800 text-blue-100 rounded-lg text-center" onClick={() => setMessage(null)}>{message} (clique para fechar)</div>}

      <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
        <h2 className="text-2xl font-semibold mb-4 text-white">Visão Geral dos Agendamentos</h2>
        <label htmlFor="date-picker-admin" className="block text-sm font-medium text-gray-300 mb-2">
          Selecione o Dia:
        </label>
        <input
          type="date"
          id="date-picker-admin" // ID diferente para evitar conflito
          value={selectedDate}
          onChange={handleDateChange}
          className="w-full md:w-1/3 p-2 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />

        <hr className="border-gray-600 my-6" />

        {loading ? (
          <div className="flex justify-center items-center p-8">
            <Spinner /> <span className="ml-3 text-lg text-gray-200">Carregando agendamentos...</span>
          </div>
        ) : (
          <>
            <h3 className="text-xl font-semibold mb-4 text-white">
              Agendamentos para {selectedDate} ({allBookings.length} {allBookings.length === 1 ? 'item' : 'itens'})
            </h3>
            
            {/* NOVO: Resumo financeiro */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-700 p-4 rounded-lg">
                <span className="text-sm text-gray-400 block">Total JÁ PAGO (dia):</span>
                <span className="text-2xl font-bold text-green-400">R$ {totalRevenue.toFixed(2)}</span>
              </div>
              <div className="bg-gray-700 p-4 rounded-lg">
                <span className="text-sm text-gray-400 block">Total PENDENTE (dia):</span>
                <span className="text-2xl font-bold text-yellow-400">R$ {pendingRevenue.toFixed(2)}</span>
              </div>
            </div>


            {allBookings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-gray-700 rounded-lg">
                  <thead className="bg-gray-900">
                    <tr>
                      <th className="p-3 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">Horário</th>
                      <th className="p-3 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">Usuário (Email)</th>
                      <th className="p-3 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">Valor</th>
                      {/* NOVO: Colunas de Pagamento */}
                      <th className="p-3 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">Método Pgto.</th>
                      <th className="p-3 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider">Status Pgto.</th>
                      <th className="p-3 text-center text-sm font-semibold text-gray-300 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-600">
                    {allBookings.map(booking => (
                      <tr key={booking.id} className="hover:bg-gray-600">
                        <td className="p-3 text-lg font-bold text-green-300">{booking.slot}</td>
                        <td className="p-3 text-gray-200">{booking.userEmail}</td>
                        <td className="p-3 text-gray-200">R$ {booking.price.toFixed(2)}</td>
                        {/* NOVO: Dados de Pagamento */}
                        <td className="p-3 text-gray-200 capitalize">{booking.paymentMethod}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${booking.paymentStatus === 'pago' ? 'bg-green-600 text-green-100' : 'bg-yellow-600 text-yellow-100'}`}>
                            {booking.paymentStatus}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button 
                            onClick={() => handleDeleteBooking(booking.id)}
                            className="text-xs text-red-400 hover:text-red-300 font-semibold bg-red-900/50 px-3 py-1 rounded-md"
                          >
                            Cancelar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-400 text-center py-4">Nenhum agendamento encontrado para este dia.</p>
            )}
          </>
        )}
      </div>
      
      {/* Modal de Confirmação */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={() => {
          if (confirmModal.onConfirm) confirmModal.onConfirm();
          setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }}
        onCancel={() => setConfirmModal({ isOpen: false, onConfirm: null, message: '' })}
      />
    </div>
  );
}


// --- NOVO COMPONENTE: MODAL DE PAGAMENTO ---
function PaymentModal({ isOpen, onClose, selectedSlots, selectedDate, totalAmount, user, userId, onBookingSuccess }) {
  const [paymentMethod, setPaymentMethod] = useState('local'); // 'cartao', 'pix', 'local'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const bookingsCollectionPath = `/artifacts/${appId}/public/data/bookings`;
  
  // Simula o processamento do pagamento e salva a reserva
  const handleProcessPayment = async () => {
    setLoading(true);
    setError(null);

    // 1. Define o status do pagamento
    let paymentStatus = 'pendente';
    if (paymentMethod === 'cartao' || paymentMethod === 'pix') {
      // Simulação: Em um app real, aqui você chamaria o Stripe/MercadoPago
      // e esperaria a confirmação. Vamos simular um sucesso imediato.
      paymentStatus = 'pago';
    } else if (paymentMethod === 'local') {
      paymentStatus = 'pendente'; // Será pago no local
    }

    try {
      // 2. Salva os agendamentos no Firestore
      const promises = selectedSlots.map(slot => {
        return addDoc(collection(db, bookingsCollectionPath), {
          date: selectedDate,
          slot: slot,
          userId: userId,
          userEmail: user.email,
          price: PRECO_POR_BLOCO_30_MIN,
          status: 'confirmed',
          createdAt: new Date(),
          paymentMethod: paymentMethod, // NOVO CAMPO
          paymentStatus: paymentStatus  // NOVO CAMPO
        });
      });
      
      await Promise.all(promises);
      
      // 3. Sucesso: Chama a função de callback
      onBookingSuccess(paymentMethod, paymentStatus);

    } catch (err) {
      console.error("Erro ao salvar reserva:", err);
      setError("Erro ao salvar a reserva. Tente novamente.");
    }
    setLoading(false);
  };

  // Renderiza a UI de simulação de pagamento
  const renderPaymentSimulation = () => {
    switch (paymentMethod) {
      case 'cartao':
        return (
          <div className="space-y-3 p-4 bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-white">Simulação (Cartão de Crédito)</h4>
            <Input label="Número do Cartão Falso" type="text" value="4242 4242 4242 4242" onChange={() => {}} />
            <div className="flex gap-3">
              <Input label="Validade" type="text" value="12/25" onChange={() => {}} />
              <Input label="CVC" type="text" value="123" onChange={() => {}} />
            </div>
            <p className="text-xs text-gray-400">Estes dados são falsos e apenas para simulação. Nenhum valor será cobrado.</p>
          </div>
        );
      case 'pix':
        return (
          <div className="space-y-3 p-4 bg-gray-700 rounded-lg text-center">
            <h4 className="font-semibold text-white">Simulação (PIX)</h4>
            <p className="text-sm text-gray-300">Escaneie o QR Code ou copie a chave:</p>
            {/* Placeholder para QR Code */}
            <div className="w-32 h-32 bg-white p-2 mx-auto rounded-lg flex items-center justify-center">
               <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12h-8M21 17h-8M21 7h-8M10 12H3v8h7v-8zM10 5H3v3h7V5z"></path><path d="M12 21v-8M17 21v-8M7 21v-8"></path></svg>
            </div>
            <p className="text-sm text-gray-400">Chave PIX (simulada):</p>
            <code className="text-xs p-2 bg-gray-800 rounded text-green-300 break-all">00020126...b2478</code>
            <p className="text-xs text-gray-400">Em um app real, o status mudaria automaticamente após o pagamento.</p>
          </div>
        );
      case 'local':
        return (
          <div className="p-4 bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-white">Pagamento no Local</h4>
            <p className="text-sm text-gray-300">O pagamento será realizado na recepção antes do início do jogo. O não comparecimento pode gerar taxas.</p>
          </div>
        );
      default:
        return null;
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg relative">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
          disabled={loading}
        >
          &times;
        </button>
        <h3 className="text-2xl font-semibold text-white mb-4">Confirmar Pagamento</h3>
        
        {error && <div className="p-3 mb-4 bg-red-800 text-red-100 rounded-lg text-center">{error}</div>}

        <div className="bg-gray-700 p-4 rounded-lg mb-4">
          <div className="flex justify-between items-center text-lg font-bold">
            <span className="text-white">TOTAL A PAGAR:</span>
            <span className="text-green-400">R$ {totalAmount.toFixed(2)}</span>
          </div>
          <p className="text-sm text-gray-400">
            {selectedSlots.length} horário(s) em {selectedDate}
          </p>
        </div>

        {/* Abas de seleção de método */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setPaymentMethod('local')}
            className={`flex-1 p-3 rounded-lg font-semibold transition-colors ${paymentMethod === 'local' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            Pagar no Local
          </button>
          <button
            onClick={() => setPaymentMethod('cartao')}
            className={`flex-1 p-3 rounded-lg font-semibold transition-colors ${paymentMethod === 'cartao' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            Cartão (Simulação)
          </button>
          <button
            onClick={() => setPaymentMethod('pix')}
            className={`flex-1 p-3 rounded-lg font-semibold transition-colors ${paymentMethod === 'pix' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            PIX (Simulação)
          </button>
        </div>

        {/* Conteúdo da simulação */}
        <div className="mb-6">
          {renderPaymentSimulation()}
        </div>

        <Button onClick={handleProcessPayment} loading={loading} className="w-full text-lg">
          {loading ? 'Processando...' : `Confirmar Reserva (${paymentMethod === 'local' ? 'Pagar no Local' : 'Pagar Agora'})`}
        </Button>
      </div>
    </div>
  );
}



// --- Componentes de UI Genéricos ---

function Input({ label, type, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required
        className="w-full p-2 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-400"
      />
    </div>
  );
}

function Button({ children, onClick, type = 'button', loading = false, className = '' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      className={`flex justify-center items-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-200 ${loading ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}

// NOVO: Componente de Modal de Confirmação
function ConfirmModal({ isOpen, message, onConfirm, onCancel }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-semibold text-white mb-4">Confirmar Ação</h3>
        <p className="text-gray-300 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
