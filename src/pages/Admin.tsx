import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockService, type Pedido, type Configuracoes, type Entregador, type Notificacao, type AdminPerfil } from '../lib/supabase';
import { formatCurrency, formatWhatsApp, formatMapsUrl, cn } from '../lib/utils';
import { 
  Bell,
  LayoutDashboard, 
  Settings, 
  ListOrdered, 
  LogOut, 
  Save, 
  Trash2, 
  CheckCircle, 
  Download, 
  Lock,
  Calendar,
  Clock,
  MessageCircle,
  TrendingUp,
  Package,
  Power,
  Edit2,
  X,
  Loader2,
  MapPin,
  Truck,
  UserPlus,
  User,
  Copy,
  Image as ImageIcon,
  ExternalLink,
  QrCode,
  Maximize,
  Search,
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { Html5Qrcode } from 'html5-qrcode';
import logoImg from '../images/Favicon_final.png';

export default function Admin() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'config' | 'orders' | 'drivers'>('dashboard');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [config, setConfig] = useState<Configuracoes | null>(null);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [showNotificacoes, setShowNotificacoes] = useState(false);
  const poppedNotifIds = React.useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingPedido, setEditingPedido] = useState<Pedido | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [newDriver, setNewDriver] = useState({ nome: '', whatsapp: '' });
  const [selectedEntregador, setSelectedEntregador] = useState<Entregador | null>(null);
  const [adminPerfis, setAdminPerfis] = useState<AdminPerfil[]>([]);
  const [newAdmin, setNewAdmin] = useState({ usuario: '', senha: '' });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('admin_user') || 'Admin');
  
  // Scanner States
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [voucherInput, setVoucherInput] = useState('');
  const [scannedOrder, setScannedOrder] = useState<Pedido | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [orderToConfirm, setOrderToConfirm] = useState<Pedido | null>(null);
  const [viewingComprovante, setViewingComprovante] = useState<string | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);

  const navigate = useNavigate();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setToast({ message: 'Link copiado para o clipboard!', type: 'success' });
    }).catch(err => {
      console.error('Erro ao copiar:', err);
      setToast({ message: 'Erro ao copiar link.', type: 'error' });
    });
  };

  useEffect(() => {
    const isAdmin = localStorage.getItem('admin_session');
    if (!isAdmin) navigate('/login');
    
    fetchData();
    const interval = setInterval(() => {
      fetchData(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [navigate, activeTab]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;

    if (isScannerOpen && isScanning) {
      setScannerError(null);
      html5QrCode = new Html5Qrcode("admin-reader");
      
      const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      html5QrCode.start(
        { facingMode: "environment" }, 
        config,
        (decodedText) => {
          handleValidateVoucher(decodedText);
          setIsScanning(false);
          if (html5QrCode) {
            html5QrCode.stop().catch(err => console.error("Error stopping scanner", err));
          }
        },
        (errorMessage) => {
          // Silent scan
        }
      ).catch((err) => {
        console.error("Erro ao iniciar scanner:", err);
        let msg = "Não foi possível acessar a câmera.";
        if (err?.includes("NotAllowedError") || err?.includes("Permission denied")) {
          msg = "Acesso à câmera negado. Por favor, libere a permissão nas configurações do seu navegador.";
        }
        setScannerError(msg);
        setIsScanning(false);
      });
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error("Failed to stop scanner", err));
      }
    };
  }, [isScannerOpen, isScanning]);

  async function fetchData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [configData, pedidosData, entregadoresData, rawNotifs, perfisData] = await Promise.all([
        mockService.getConfig(),
        mockService.getPedidos(),
        mockService.getEntregadores(),
        mockService.getNotificacoes(),
        mockService.getAdminPerfis()
      ]);
      
      const notifsData = rawNotifs.filter(n => n.publico === 'admin' || n.publico === 'todos');
      
      // Não sobrescreve as configurações se o polling é silencioso e o usuário está editando a aba de config
      if (!silent || activeTab !== 'config') {
        setConfig(configData);
        // Filtra o usuário 'dev' para que ele fique oculto na listagem de acessos
        setAdminPerfis(perfisData.filter(p => p.usuario.toLowerCase() !== 'dev'));
      }
      setEntregadores(entregadoresData);
      setPedidos(pedidosData.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      }));
      setNotificacoes(notifsData);

      const unread = notifsData.filter(n => !n.lida);
      if (silent && unread.length > 0) {
        let showedToast = false;
        for (const n of unread) {
          if (!poppedNotifIds.current.has(n.id)) {
            poppedNotifIds.current.add(n.id);
            if (!showedToast) {
              setToast({ message: n.mensagem, type: 'success' });
              showedToast = true;
            }
          }
        }
      } else if (!silent) {
        notifsData.forEach(n => poppedNotifIds.current.add(n.id));
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function markAllNotifsAsRead() {
    await Promise.all(
      notificacoes
        .filter(n => !n.lida)
        .map(n => mockService.markNotificacaoLida(n.id, 'admin'))
    );
    setNotificacoes(notificacoes.map(n => ({ ...n, lida: true })));
  }

  async function handleAddEntregador(e: React.FormEvent) {
    e.preventDefault();
    if (!newDriver.nome) return;
    
    try {
      await mockService.addEntregador({ ...newDriver });
      setNewDriver({ nome: '', whatsapp: '' });
      setToast({ message: 'Entregador cadastrado com sucesso!', type: 'success' });
      fetchData();
    } catch (error) {
      console.error('Erro ao cadastrar entregador:', error);
      setToast({ message: 'Erro ao cadastrar entregador.', type: 'error' });
    }
  }

  async function handleValidateVoucher(voucher: string) {
    const allPedidos = await mockService.getPedidos();
    const order = allPedidos.find(p => p.voucher === voucher);

    if (!order) {
      setToast({ message: 'Voucher não encontrado ou inválido.', type: 'error' });
      return;
    }

    if (order.status_retirada === 'Entregue') {
      // Permitimos abrir para ver o selo de conclusão
    }

    setScannedOrder(order);
    setIsScannerOpen(false);
    setVoucherInput('');
  }

  async function confirmPickup(id: string) {
    try {
      await mockService.updatePedido(id, { status_retirada: 'Entregue' });
      
      // Mostrar selo antes de concluir
      setScannedOrder(prev => prev ? { ...prev, status_retirada: 'Entregue' } : null);
      
      setTimeout(() => {
        setScannedOrder(null);
        setOrderToConfirm(null);
        setShowSuccessModal(true);
        fetchData();
      }, 1500);
    } catch (err) {
      console.error('Erro ao confirmar retirada:', err);
      setToast({ message: 'Erro ao confirmar retirada.', type: 'error' });
    }
  }

  async function handleDeleteEntregador(id: string) {
    setConfirmModal({
      title: 'Excluir Entregador',
      message: 'Tem certeza que deseja excluir este entregador?',
      onConfirm: async () => {
        try {
          await mockService.deleteEntregador(id);
          setToast({ message: 'Entregador excluído com sucesso!', type: 'success' });
          await fetchData();
          setConfirmModal(null);
        } catch (error) {
          console.error('Erro ao excluir:', error);
          setToast({ message: 'Erro ao excluir entregador.', type: 'error' });
        }
      }
    });
  }

  async function handleReassignOrders() {
    try {
      await mockService.reassignOrders();
      setToast({ message: 'Pedidos redistribuídos com sucesso!', type: 'success' });
      await fetchData();
    } catch (error) {
      console.error('Erro ao redistribuir:', error);
      setToast({ message: 'Erro ao redistribuir pedidos.', type: 'error' });
    }
  }

  async function handleUpdateConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    try {
      await mockService.saveConfig(config);
      setToast({ message: 'Configurações salvas com sucesso!', type: 'success' });
      await fetchData(true); // Atualiza os dados imediatamente após salvar
    } catch (error) {
      console.error('Erro ao salvar:', error);
      setToast({ message: 'Erro ao salvar configurações.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function toggleVendas() {
    if (!config) return;
    const newValue = !config.vendas_encerradas;
    const updated = { ...config, vendas_encerradas: newValue };
    await mockService.saveConfig(updated);
    setConfig(updated);
  }

  async function markAsPaid(id: string, currentStatus: string) {
    if (currentStatus === 'Pago') return;
    
    setConfirmModal({
      title: 'Confirmar Pagamento',
      message: 'Deseja confirmar o pagamento deste pedido?',
      onConfirm: async () => {
        const newStatus = 'Pago';
        const voucher = Math.random().toString(36).substring(2, 8).toUpperCase();
        await mockService.updatePedido(id, { status_pagamento: newStatus, voucher });
        await fetchData();
        setConfirmModal(null);
        setToast({ message: 'Pagamento confirmado! Voucher gerado.', type: 'success' });
      }
    });
  }

  async function toggleRetirada(id: string, currentStatus: string) {
    const newStatus = currentStatus === 'Pendente' ? 'Entregue' : 'Pendente';
    
    setConfirmModal({
      title: 'Alterar Status de Retirada',
      message: `Deseja marcar este pedido como ${newStatus}?`,
      onConfirm: async () => {
        await mockService.updatePedido(id, { status_retirada: newStatus });
        await fetchData();
        setConfirmModal(null);
        setToast({ message: `Status de retirada alterado para ${newStatus}.`, type: 'success' });
      }
    });
  }

  async function deletePedido(id: string) {
    setConfirmModal({
      title: 'Excluir Pedido',
      message: 'Tem certeza que deseja excluir este pedido? Esta ação não pode ser desfeita.',
      onConfirm: async () => {
        await mockService.deletePedido(id);
        await fetchData();
        setConfirmModal(null);
        setToast({ message: 'Pedido excluído com sucesso.', type: 'success' });
      }
    });
  }

  async function handleUpdatePedido(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPedido) return;
    
    try {
      await mockService.updatePedido(editingPedido.id, editingPedido);
      await fetchData();
      setEditingPedido(null);
      setToast({ message: 'Pedido atualizado com sucesso!', type: 'success' });
    } catch (error) {
      console.error('Erro ao atualizar pedido:', error);
      setToast({ message: 'Erro ao atualizar pedido.', type: 'error' });
    }
  }

  function exportToExcel() {
    const data = pedidos.map(p => ({
      'Nº Pedido': p.numero_pedido,
      Nome: p.nome,
      WhatsApp: p.whatsapp,
      Tipo: p.tipo_entrega,
      Endereço: p.endereco || 'N/A',
      Entregador: entregadores.find(e => e.id === p.entregador_id)?.nome || 'N/A',
      Quantidade: p.quantidade,
      Pagamento: p.pagamento,
      Status: p.status_pagamento,
      Retirada: p.status_retirada || 'Pendente',
      Voucher: p.voucher || '---',
      Data: p.created_at ? new Date(p.created_at).toLocaleString('pt-BR') : '---'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    XLSX.writeFile(wb, "pedidos_tambaqui.xlsx");
  }

  function handleLogout() {
    localStorage.removeItem('admin_session');
    navigate('/login');
  }

  const totais = {
    vendidos: pedidos.reduce((acc, curr) => acc + curr.quantidade, 0),
    arrecadado: pedidos.filter(p => p.status_pagamento === 'Pago').reduce((acc, curr) => acc + (curr.quantidade * (config?.valor || 0)), 0),
    pendente: pedidos.filter(p => p.status_pagamento === 'Pendente').reduce((acc, curr) => acc + (curr.quantidade * (config?.valor || 0)), 0),
    pedidosPagos: pedidos.filter(p => p.status_pagamento === 'Pago' && (p.status_retirada || 'Pendente') === 'Pendente').length,
    pedidosEntregues: pedidos.filter(p => (p.status_retirada || 'Pendente') === 'Entregue').length,
    pedidosPendentes: pedidos.filter(p => p.status_pagamento === 'Pendente').length
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-12 h-12 text-amber-500 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-espresso flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-espresso-light border-r border-espresso-border p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 overflow-hidden rounded-lg shadow-lg shadow-amber-950/20">
            <img src={logoImg} alt="Logo" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-lg font-bold text-white font-serif leading-tight">Igreja Resgate</h2>
            <p className="text-[10px] text-amber-500 uppercase tracking-widest font-bold">Admin Panel</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'dashboard' ? 'bg-amber-600 text-white' : 'text-stone-400 hover:bg-espresso-border'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="font-medium">Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'orders' ? 'bg-amber-600 text-white' : 'text-stone-400 hover:bg-stone-800'}`}
          >
            <ListOrdered className="w-5 h-5" />
            <span className="font-medium">Pedidos</span>
          </button>
          <button 
            onClick={() => setActiveTab('drivers')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'drivers' ? 'bg-amber-600 text-white' : 'text-stone-400 hover:bg-stone-800'}`}
          >
            <Truck className="w-5 h-5" />
            <span className="font-medium">Entregadores</span>
          </button>
          <button 
            onClick={() => setActiveTab('config')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'config' ? 'bg-amber-600 text-white' : 'text-stone-400 hover:bg-stone-800'}`}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Configurações</span>
          </button>
        </nav>

        <button 
          onClick={handleLogout}
          className="mt-auto flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-900/20 rounded-lg transition-all"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sair</span>
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-auto bg-[radial-gradient(circle_at_top_right,#1a1210,transparent_50%)]">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10 pb-6 border-b border-white/5 relative z-50">
          <div>
            <h1 className="text-3xl font-black text-white font-serif mb-1 capitalize">
              {activeTab === 'dashboard' && 'Visão Geral'}
              {activeTab === 'orders' && 'Lista de Pedidos'}
              {activeTab === 'drivers' && 'Gestão de Entregadores'}
              {activeTab === 'config' && 'Configurações'}
            </h1>
            <p className="text-stone-500 text-xs uppercase tracking-widest font-bold">Gerenciamento Tambaqui Igreja Resgate</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 lg:gap-8">
            {/* User & Time Info */}
            <div className="flex items-center gap-6 pr-6 border-r border-white/10">
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                  <User className="w-4 h-4" />
                  {currentUser}
                </div>
                <div className="flex items-center gap-3 text-stone-400 text-[11px] mt-0.5">
                  <span className="flex items-center gap-1 font-medium bg-white/5 px-2 py-0.5 rounded border border-white/5">
                    <Calendar className="w-3 h-3 text-amber-600/60" />
                    {new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(currentTime)}
                  </span>
                  <span className="flex items-center gap-1 font-mono bg-white/5 px-2 py-0.5 rounded border border-white/5">
                    <Clock className="w-3 h-3 text-amber-600/60" />
                    {currentTime.toLocaleTimeString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <button 
                onClick={() => {
                  setShowNotificacoes(!showNotificacoes);
                  if (!showNotificacoes) markAllNotifsAsRead();
                }}
                className="w-10 h-10 bg-espresso rounded-full flex items-center justify-center border border-espresso-border hover:bg-espresso-light transition relative"
              >
                <Bell className="w-5 h-5 text-amber-500" />
                {notificacoes.filter(n => !n.lida).length > 0 && (
                  <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-stone-800 animate-pulse" />
                )}
              </button>

              <AnimatePresence>
                {showNotificacoes && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute top-12 right-0 w-80 bg-espresso border border-espresso-border rounded-xl shadow-2xl overflow-hidden"
                  >
                    <div className="p-4 bg-espresso-light border-b border-espresso-border flex justify-between items-center">
                      <h3 className="text-white font-bold">Notificações</h3>
                      <button onClick={() => setShowNotificacoes(false)} className="text-stone-400 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notificacoes.length > 0 ? (
                        notificacoes.map(n => (
                          <div key={n.id} className={`p-4 border-b border-espresso-border last:border-0 ${!n.lida ? 'bg-amber-900/10' : ''}`}>
                            <p className="text-sm text-stone-300">{n.mensagem}</p>
                            <p className="text-[10px] text-stone-500 mt-2 font-mono">
                              {new Date(n.data).toLocaleTimeString('pt-BR')}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-stone-500">
                          <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                          <p className="text-sm">Nenhuma notificação</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {activeTab === 'orders' && (
              <button onClick={exportToExcel} className="gold-outline flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
            )}
          </div>
        </div>
      </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="wood-card p-6 border-l-4 border-amber-600">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-stone-400 text-sm uppercase tracking-wider font-bold">Total Vendido</p>
                      <h3 className="text-4xl font-bold text-white mt-1">{totais.vendidos} <span className="text-lg text-stone-500">/ {config?.limite_total}</span></h3>
                    </div>
                    <Package className="w-8 h-8 text-amber-600" />
                  </div>
                  <div className="mt-4 w-full bg-stone-800 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-amber-600 h-full transition-all duration-1000" 
                      style={{ width: `${(totais.vendidos / (config?.limite_total || 1)) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="wood-card p-6 border-l-4 border-green-600">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-stone-400 text-sm uppercase tracking-wider font-bold">Arrecadado</p>
                      <h3 className="text-4xl font-bold text-green-500 mt-1">{formatCurrency(totais.arrecadado)}</h3>
                    </div>
                    <TrendingUp className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-stone-500 text-xs mt-2">Pagamentos confirmados</p>
                </div>

                <div className="wood-card p-6 border-l-4 border-red-600">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-stone-400 text-sm uppercase tracking-wider font-bold">Pendente</p>
                      <h3 className="text-4xl font-bold text-red-500 mt-1">{formatCurrency(totais.pendente)}</h3>
                    </div>
                    <Clock className="w-8 h-8 text-red-600" />
                  </div>
                  <p className="text-stone-500 text-xs mt-2">Aguardando confirmação</p>
                </div>

                <div className="wood-card p-6 border-l-4 border-blue-600">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-stone-400 text-sm uppercase tracking-wider font-bold">Aguardando Retirada</p>
                      <h3 className="text-4xl font-bold text-blue-500 mt-1">{totais.pedidosPagos}</h3>
                    </div>
                    <Clock className="w-8 h-8 text-blue-600" />
                  </div>
                  <p className="text-stone-500 text-xs mt-2">Pagos mas não retirados</p>
                </div>

                <div className="wood-card p-6 border-l-4 border-stone-500">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-stone-400 text-sm uppercase tracking-wider font-bold">Entregues</p>
                      <h3 className="text-4xl font-bold text-stone-300 mt-1">{totais.pedidosEntregues}</h3>
                    </div>
                    <CheckCircle className="w-8 h-8 text-stone-500" />
                  </div>
                  <p className="text-stone-500 text-xs mt-2">Total de pedidos finalizados</p>
                </div>
              </div>

              <div className="wood-card p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Status das Vendas</h3>
                  <p className="text-stone-400">
                    {config?.vendas_encerradas 
                      ? "As vendas estão atualmente encerradas para o público." 
                      : "As vendas estão abertas e recebendo pedidos."}
                  </p>
                </div>
                <button 
                  onClick={toggleVendas}
                  className={`flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-lg transition-all ${config?.vendas_encerradas ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                >
                  <Power className="w-6 h-6" />
                  {config?.vendas_encerradas ? 'Abrir Vendas' : 'Encerrar Vendas'}
                </button>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-bold text-white font-serif flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" /> Pedidos Pagos (Aguardando Retirada)
                </h3>
                <div className="wood-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-espresso-light/50 text-stone-400 uppercase text-[10px] tracking-widest font-bold">
                          <th className="px-6 py-3">Cliente</th>
                          <th className="px-6 py-3">Quantidade</th>
                          <th className="px-6 py-3">Voucher</th>
                          <th className="px-6 py-3">Retirada</th>
                          <th className="px-6 py-3">Valor</th>
                          <th className="px-6 py-3">Data</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-espresso-border">
                        {pedidos.filter(p => p.status_pagamento === 'Pago' && (p.status_retirada || 'Pendente') === 'Pendente').length > 0 ? (
                          pedidos
                            .filter(p => p.status_pagamento === 'Pago' && (p.status_retirada || 'Pendente') === 'Pendente')
                            .sort((a, b) => {
                              const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                              const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                              return dateB - dateA;
                            })
                            .slice(0, 10)
                            .map((p) => (
                              <tr key={p.id} className="hover:bg-stone-800/30 transition-colors">
                                <td className="px-6 py-4">
                                  <p className="font-bold text-white">{p.nome}</p>
                                  <p className="text-stone-500 text-xs">{p.numero_pedido}</p>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-stone-300">{p.quantidade}x</p>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="bg-amber-900/30 text-amber-500 px-2 py-1 rounded font-mono text-xs font-bold">
                                    {p.voucher || '---'}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <button 
                                    onClick={() => toggleRetirada(p.id, p.status_retirada || 'Pendente')}
                                    className={`text-[10px] font-bold uppercase px-2 py-1 rounded transition-all ${
                                      (p.status_retirada || 'Pendente') === 'Entregue' 
                                        ? 'bg-green-900/30 text-green-500' 
                                        : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
                                    }`}
                                  >
                                    {p.status_retirada || 'Pendente'}
                                  </button>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-green-500 font-bold">{formatCurrency(p.quantidade * (config?.valor || 0))}</p>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-stone-500 text-xs">
                                    {p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '---'}
                                  </p>
                                </td>
                              </tr>
                            ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-6 py-8 text-center text-stone-500 italic">
                              Nenhum pedido pago aguardando retirada.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-bold text-white font-serif flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" /> Pedidos Entregues
                </h3>
                <div className="wood-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-stone-800/50 text-stone-400 uppercase text-[10px] tracking-widest font-bold">
                          <th className="px-6 py-3">Cliente</th>
                          <th className="px-6 py-3">Entregador</th>
                          <th className="px-6 py-3">Quantidade</th>
                          <th className="px-6 py-3">Voucher</th>
                          <th className="px-6 py-3">Retirada</th>
                          <th className="px-6 py-3">Valor</th>
                          <th className="px-6 py-3">Data</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-800">
                        {pedidos.filter(p => (p.status_retirada || 'Pendente') === 'Entregue').length > 0 ? (
                          pedidos
                            .filter(p => (p.status_retirada || 'Pendente') === 'Entregue')
                            .sort((a, b) => {
                              const dateA = a.delivered_at ? new Date(a.delivered_at).getTime() : 0;
                              const dateB = b.delivered_at ? new Date(b.delivered_at).getTime() : 0;
                              return dateB - dateA;
                            })
                            .slice(0, 10)
                            .map((p) => (
                              <tr key={p.id} className="hover:bg-stone-800/30 transition-colors">
                                <td className="px-6 py-4">
                                  <p className="font-bold text-white">{p.nome}</p>
                                  <p className="text-stone-500 text-xs">{p.numero_pedido}</p>
                                </td>
                                <td className="px-6 py-4">
                                  {p.tipo_entrega === 'Entrega' ? (
                                    <div className="flex items-center gap-2">
                                      <User className="w-3 h-3 text-stone-500" />
                                      <p className="text-stone-300 text-xs">
                                        {entregadores.find(e => e.id === p.entregador_id)?.nome || 'N/A'}
                                      </p>
                                    </div>
                                  ) : (
                                    <span className="text-stone-600 text-[10px] italic">N/A</span>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-stone-300">{p.quantidade}x</p>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="bg-amber-900/30 text-amber-500 px-2 py-1 rounded font-mono text-xs font-bold">
                                    {p.voucher || '---'}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <button 
                                    onClick={() => toggleRetirada(p.id, p.status_retirada || 'Pendente')}
                                    className={`text-[10px] font-bold uppercase px-2 py-1 rounded transition-all ${
                                      (p.status_retirada || 'Pendente') === 'Entregue' 
                                        ? 'bg-green-900/30 text-green-500' 
                                        : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
                                    }`}
                                  >
                                    {p.status_retirada || 'Pendente'}
                                  </button>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-green-500 font-bold">{formatCurrency(p.quantidade * (config?.valor || 0))}</p>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-stone-500 text-[10px] font-mono">
                                    {p.delivered_at ? new Date(p.delivered_at).toLocaleString('pt-BR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit'
                                    }) : (p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '---')}
                                  </p>
                                </td>
                              </tr>
                            ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-6 py-8 text-center text-stone-500 italic">
                              Nenhum pedido entregue ainda.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'orders' && (
            <motion.div 
              key="orders"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="wood-card overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-800/50 text-amber-500 uppercase text-xs tracking-widest font-bold">
                      <th className="px-6 py-4">Cliente</th>
                      <th className="px-6 py-4">Tipo/Endereço</th>
                      <th className="px-6 py-4">Entregador</th>
                      <th className="px-6 py-4">Pedido</th>
                      <th className="px-6 py-4">Valor</th>
                      <th className="px-6 py-4">Pagamento</th>
                      <th className="px-6 py-4">Retirada</th>
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800">
                    {pedidos.map((p) => (
                      <tr 
                        key={p.id} 
                        className={cn(
                          "transition-all duration-300",
                          p.status_pagamento === 'Pago' 
                            ? "row-paid" 
                            : (p.comprovante_url ? "row-pending-receipt" : "hover:bg-stone-800/30")
                        )}
                      >
                        <td className="px-6 py-4">
                          <p className="text-amber-500 font-mono font-bold text-xs mb-1">{p.numero_pedido}</p>
                          <p className="font-bold text-white">{p.nome}</p>
                          <a 
                            href={formatWhatsApp(p.whatsapp)} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-stone-400 text-sm flex items-center gap-1 hover:text-green-500"
                          >
                            <MessageCircle className="w-3 h-3" /> {p.whatsapp}
                          </a>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${p.tipo_entrega === 'Entrega' ? 'bg-blue-900/30 text-blue-400' : 'bg-stone-700 text-stone-300'}`}>
                            {p.tipo_entrega}
                          </span>
                          {p.endereco && (
                            <a 
                              href={formatMapsUrl(p.endereco)} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-stone-400 text-xs mt-1 max-w-xs truncate flex items-center gap-1 hover:text-blue-500"
                            >
                              <MapPin className="w-3 h-3" /> {p.endereco}
                            </a>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {p.tipo_entrega === 'Entrega' ? (
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-stone-800 rounded-full flex items-center justify-center border border-stone-700">
                                <User className="w-4 h-4 text-stone-500" />
                              </div>
                              <div>
                                <p className="text-white text-sm font-bold">
                                  {entregadores.find(e => e.id === p.entregador_id)?.nome || 'Não atribuído'}
                                </p>
                                {entregadores.find(e => e.id === p.entregador_id)?.anonimo && (
                                  <span className="text-[9px] bg-stone-700 text-stone-400 px-1 rounded uppercase font-bold">Anônimo</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-stone-600 text-xs italic">N/A</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-white font-bold">{p.quantidade}x Banda(s)</p>
                          <p className="text-stone-500 text-xs uppercase">{p.pagamento}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-white font-bold">{formatCurrency(p.quantidade * (config?.valor || 0))}</p>
                        </td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => markAsPaid(p.id, p.status_pagamento)}
                            disabled={p.status_pagamento === 'Pago'}
                            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                              p.status_pagamento === 'Pago' 
                                ? 'bg-green-900/30 text-green-500 cursor-default' 
                                : 'bg-red-900/30 text-red-500 hover:bg-red-900/50'
                            }`}
                          >
                            {p.status_pagamento === 'Pago' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {p.status_pagamento}
                          </button>
                          {p.comprovante_url && (
                            <button 
                              onClick={() => setViewingComprovante(p.comprovante_url!)}
                              className="mt-2 flex items-center gap-1.5 text-amber-500 hover:text-amber-400 text-[10px] font-bold uppercase transition-colors"
                            >
                              <ImageIcon className="w-3.2 h-3.2" /> Ver Comprovante
                            </button>
                          )}
                          {p.voucher && (
                            <p className="mt-1 text-[10px] font-mono text-amber-500 font-bold">Voucher: {p.voucher}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => toggleRetirada(p.id, p.status_retirada || 'Pendente')}
                            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                              (p.status_retirada || 'Pendente') === 'Entregue' 
                                ? 'bg-green-900/30 text-green-500' 
                                : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
                            }`}
                          >
                            {(p.status_retirada || 'Pendente') === 'Entregue' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {p.status_retirada || 'Pendente'}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-stone-400 text-xs">
                            {p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '---'}
                          </p>
                          {p.created_at && (
                            <p className="text-stone-600 text-[10px]">
                              {new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                          {p.status_retirada === 'Entregue' && p.delivered_at && (
                            <p className="text-green-600 text-[9px] mt-1 font-bold">
                              Entregue: {new Date(p.delivered_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button 
                            onClick={() => setEditingPedido(p)}
                            className="p-2 text-stone-500 hover:text-amber-500 transition-colors"
                            title="Editar Pedido"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button onClick={() => deletePedido(p.id)} className="p-2 text-stone-500 hover:text-red-500 transition-colors">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'drivers' && (
            <motion.div 
              key="drivers"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Add Driver Form */}
                <div className="lg:col-span-1 space-y-6">
                  {/* Local Pickup Scanner Banner */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setVoucherInput('');
                      setScannedOrder(null);
                      setIsScannerOpen(true);
                    }}
                    className="w-full wood-card p-6 bg-gradient-to-r from-amber-600/20 to-amber-900/20 border-amber-500/30 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-900/40 group-hover:rotate-12 transition-transform">
                        <QrCode className="w-6 h-6 text-stone-950" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-lg font-bold text-white font-serif">Retirada no Local</h3>
                        <p className="text-stone-400 text-[10px] uppercase tracking-widest font-bold">Validar Voucher</p>
                      </div>
                    </div>
                    <Maximize className="w-5 h-5 text-amber-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                  </motion.button>

                  <div className="wood-card p-6">
                    <h3 className="text-xl font-bold text-white font-serif mb-6 flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-amber-500" /> Novo Entregador
                    </h3>
                    <form onSubmit={handleAddEntregador} className="space-y-4">
                      <div>
                        <label className="label-text">Nome do Entregador</label>
                        <input 
                          type="text" 
                          className="input-field"
                          placeholder="Ex: Carlos Silva"
                          value={newDriver.nome}
                          onChange={e => setNewDriver({...newDriver, nome: e.target.value})}
                          required
                        />
                      </div>
                      <div>
                        <label className="label-text">WhatsApp</label>
                        <input 
                          type="text" 
                          className="input-field"
                          placeholder="(00) 00000-0000"
                          value={newDriver.whatsapp}
                          onChange={e => setNewDriver({...newDriver, whatsapp: e.target.value})}
                        />
                      </div>
                      <button type="submit" className="gold-button w-full flex items-center justify-center gap-2">
                        <Save className="w-4 h-4" /> Cadastrar
                      </button>
                    </form>
                  </div>
                </div>

                {/* Drivers List */}
                <div className="lg:col-span-2">
                  <div className="wood-card overflow-hidden">
                    <div className="p-6 border-b border-stone-800 flex justify-between items-center">
                      <div>
                        <h3 className="text-xl font-bold text-white font-serif">Entregadores Ativos</h3>
                        <p className="text-stone-500 text-sm">Os pedidos de entrega são divididos automaticamente entre eles.</p>
                      </div>
                      <button 
                        onClick={handleReassignOrders}
                        className="gold-outline text-xs flex items-center gap-2"
                        title="Redistribuir todos os pedidos de entrega entre os entregadores atuais"
                      >
                        <TrendingUp className="w-3 h-3" /> Redistribuir
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-stone-800/50 text-amber-500 uppercase text-[10px] tracking-widest font-bold">
                            <th className="px-6 py-4">Entregador</th>
                            <th className="px-6 py-4">WhatsApp</th>
                            <th className="px-6 py-4">Atribuídos</th>
                            <th className="px-6 py-4">Entregues</th>
                            <th className="px-6 py-4 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-800">
                          {entregadores.length > 0 ? (
                            entregadores.map((e) => (
                              <tr key={e.id} className="hover:bg-stone-800/30 transition-colors">
                                <td className="px-6 py-4">
                                  <div 
                                    className="flex items-center gap-3 cursor-pointer group"
                                    onClick={() => setSelectedEntregador(e)}
                                  >
                                    <div className="w-10 h-10 bg-amber-600/10 rounded-full flex items-center justify-center border border-amber-600/20 group-hover:bg-amber-600/20 transition-colors">
                                      <User className="w-5 h-5 text-amber-500" />
                                    </div>
                                    <div>
                                      <p className="font-bold text-white group-hover:text-amber-500 transition-colors">{e.nome}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  {e.whatsapp ? (
                                    <a 
                                      href={formatWhatsApp(e.whatsapp)} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="text-stone-400 text-sm flex items-center gap-1 hover:text-green-500"
                                    >
                                      <MessageCircle className="w-3 h-3" /> {e.whatsapp}
                                    </a>
                                  ) : (
                                    <span className="text-stone-600 text-xs italic">N/A</span>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <Package className="w-4 h-4 text-stone-500" />
                                    <span className="text-white font-bold">
                                      {pedidos.filter(p => p.entregador_id === e.id).length}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    <span className="text-white font-bold">
                                      {pedidos.filter(p => p.entregador_id === e.id && p.status_retirada === 'Entregue').length}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button 
                                      onClick={() => {
                                        const baseUrl = window.location.href.split('#')[0];
                                        copyToClipboard(`${baseUrl}#/admin/entregador/${e.codigo}`);
                                      }}
                                      className="p-2 text-stone-500 hover:text-amber-500 transition-colors"
                                      title="Copiar link do entregador"
                                    >
                                      <Copy className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteEntregador(e.id)}
                                      className="p-2 text-stone-500 hover:text-red-500 transition-colors"
                                    >
                                      <Trash2 className="w-5 h-5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="px-6 py-12 text-center text-stone-500 italic">
                                Nenhum entregador cadastrado.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'config' && config && (
            <motion.div 
              key="config"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="wood-card p-8 max-w-2xl"
            >
              <form onSubmit={handleUpdateConfig} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="label-text">Nome do Evento</label>
                    <input 
                      type="text" 
                      className="input-field"
                      value={config.evento_nome}
                      onChange={e => setConfig({...config, evento_nome: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="label-text">Chave PIX</label>
                    <input 
                      type="text" 
                      className="input-field"
                      placeholder="CPF, E-mail, Celular ou Aleatória"
                      value={config.chave_pix}
                      onChange={e => setConfig({...config, chave_pix: e.target.value})}
                    />
                    <p className="text-xs text-stone-500 mt-2">
                     Formatos: CPF (só números), Celular (com +55), E-mail, ou Chave aleatória.
                    </p>
                  </div>
                  <div>
                    <label className="label-text">Limite de Bandas</label>
                    <input 
                      type="number" 
                      className="input-field"
                      value={config.limite_total}
                      onChange={e => setConfig({...config, limite_total: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <label className="label-text">Valor por Banda (R$)</label>
                    <input 
                      type="number" 
                      className="input-field"
                      value={config.valor}
                      onChange={e => setConfig({...config, valor: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>

                <div>
                  <label className="label-text">Mensagem de Agradecimento (Voucher)</label>
                  <textarea 
                    className="input-field h-24 resize-none"
                    value={config.mensagem_voucher}
                    onChange={e => setConfig({...config, mensagem_voucher: e.target.value})}
                    placeholder="Digite a mensagem que aparecerá no voucher..."
                  />
                  <p className="text-stone-500 text-[10px] mt-1 italic">Esta mensagem será exibida no rodapé do voucher resgatado pelo cliente.</p>
                </div>

                <div className="flex items-center gap-4 p-4 bg-stone-800/50 rounded-lg border border-stone-700">
                  <div className="flex-1">
                    <p className="text-white font-bold">Ativar Entregas</p>
                    <p className="text-stone-400 text-sm">Permitir que clientes escolham a opção de entrega.</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      const updated = {...config, entrega_ativa: !config.entrega_ativa};
                      setConfig(updated);
                      mockService.saveConfig(updated);
                      setToast({ message: updated.entrega_ativa ? 'Entregas Ativadas!' : 'Entregas Desativadas!', type: 'success' });
                    }}
                    className={`w-14 h-8 rounded-full transition-all relative ${config.entrega_ativa ? 'bg-amber-600' : 'bg-stone-700'}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${config.entrega_ativa ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                  <button 
                    disabled={saving}
                    type="submit" 
                    className="gold-button w-full flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Salvar Configurações Gerais</>}
                  </button>
                </form>

                {/* Admin Access Data */}
                <div className="wood-card p-6 border-amber-900/20 mt-8">
                  <h3 className="text-xl font-bold text-white font-serif mb-6 flex items-center gap-2">
                    <Lock className="w-6 h-6 text-amber-500" /> Gestão de Acesso (Administradores)
                  </h3>
                  
                  {/* List of Admins */}
                  <div className="space-y-4 mb-8">
                    {adminPerfis.map(perfil => (
                      <div key={perfil.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-espresso/50 rounded-xl border border-amber-900/10 gap-4">
                        <div className="flex-1">
                          <p className="text-stone-400 text-[10px] uppercase font-bold tracking-widest">Usuário</p>
                          <p className="text-white font-bold">{perfil.usuario}</p>
                        </div>
                        <div className="flex-1">
                          <p className="text-stone-400 text-[10px] uppercase font-bold tracking-widest">Senha</p>
                          <p className="text-stone-300 font-mono text-xs">••••••••</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              const newPass = prompt('Nova senha para ' + perfil.usuario, '');
                              if (newPass) {
                                mockService.updateAdminPerfil({ ...perfil, senha: newPass })
                                  .then(() => {
                                    setToast({ message: 'Senha atualizada!', type: 'success' });
                                    fetchData(true);
                                  });
                              }
                            }}
                            className="p-2 text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all"
                            title="Alterar Senha"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {adminPerfis.length > 1 && (
                            <button 
                              onClick={() => {
                                if (confirm('Excluir acesso para ' + perfil.usuario + '?')) {
                                  mockService.deleteAdminPerfil(perfil.id!)
                                    .then(() => {
                                      setToast({ message: 'Acesso excluído!', type: 'success' });
                                      fetchData(true);
                                    });
                                }
                              }}
                              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                              title="Remover Acesso"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add New Admin Form */}
                  <div className="p-5 bg-amber-900/5 rounded-2xl border border-amber-900/10">
                    <h4 className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-4">Adicionar Novo Acesso</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <input 
                        type="text"
                        placeholder="Usuário"
                        className="input-field py-2 text-sm"
                        value={newAdmin.usuario}
                        onChange={e => setNewAdmin({ ...newAdmin, usuario: e.target.value })}
                      />
                      <input 
                        type="password"
                        placeholder="Senha"
                        className="input-field py-2 text-sm"
                        value={newAdmin.senha}
                        onChange={e => setNewAdmin({ ...newAdmin, senha: e.target.value })}
                      />
                    </div>
                    <button 
                      onClick={async () => {
                        if (!newAdmin.usuario || !newAdmin.senha) return;
                        setSaving(true);
                        try {
                          await mockService.addAdminPerfil(newAdmin.usuario, newAdmin.senha);
                          setNewAdmin({ usuario: '', senha: '' });
                          setToast({ message: 'Novo acesso criado!', type: 'success' });
                          await fetchData(true);
                        } catch (err) {
                          setToast({ message: 'Erro ao criar acesso.', type: 'error' });
                          console.error(err);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className="w-full py-2.5 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 transition-all text-sm uppercase"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Criar Novo Administrador'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
        </AnimatePresence>

        {/* Edit Modal */}
        <AnimatePresence>
          {editingPedido && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="wood-card w-full max-w-lg p-8 relative"
              >
                <button 
                  onClick={() => setEditingPedido(null)}
                  className="absolute top-4 right-4 text-stone-500 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>

                <h2 className="text-2xl font-bold text-white font-serif mb-6 flex items-center gap-2">
                  <Edit2 className="w-6 h-6 text-amber-500" /> Editar Pedido {editingPedido.numero_pedido}
                </h2>

                <form onSubmit={handleUpdatePedido} className="space-y-4">
                  <div>
                    <label className="label-text">Nome do Cliente</label>
                    <input 
                      type="text" 
                      className="input-field"
                      value={editingPedido.nome}
                      onChange={e => setEditingPedido({...editingPedido, nome: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <label className="label-text">WhatsApp</label>
                    <input 
                      type="text" 
                      className="input-field"
                      value={editingPedido.whatsapp}
                      onChange={e => setEditingPedido({...editingPedido, whatsapp: e.target.value})}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label-text">Status Pagamento</label>
                      <select 
                        className="input-field"
                        value={editingPedido.status_pagamento}
                        onChange={e => {
                          const newStatus = e.target.value as any;
                          setConfirmModal({
                            title: 'Alterar Status',
                            message: `Deseja alterar o status para ${newStatus}?`,
                            onConfirm: () => {
                              const voucher = newStatus === 'Pago' && !editingPedido.voucher 
                                ? Math.random().toString(36).substring(2, 8).toUpperCase() 
                                : editingPedido.voucher;
                              setEditingPedido({...editingPedido, status_pagamento: newStatus, voucher});
                              setConfirmModal(null);
                            }
                          });
                        }}
                      >
                        <option value="Pendente">Pendente</option>
                        <option value="Pago">Pago</option>
                      </select>
                    </div>
                    <div>
                      <label className="label-text">Status Retirada</label>
                      <select 
                        className="input-field"
                        value={editingPedido.status_retirada || 'Pendente'}
                        onChange={e => setEditingPedido({...editingPedido, status_retirada: e.target.value as any})}
                      >
                        <option value="Pendente">Pendente</option>
                        <option value="Entregue">Entregue</option>
                      </select>
                    </div>
                    <div>
                      <label className="label-text">Tipo Entrega</label>
                      <select 
                        className="input-field"
                        value={editingPedido.tipo_entrega}
                        onChange={e => setEditingPedido({...editingPedido, tipo_entrega: e.target.value as any})}
                      >
                        <option value="Retirada">Retirada</option>
                        <option value="Entrega">Entrega</option>
                      </select>
                    </div>
                    {editingPedido.tipo_entrega === 'Entrega' && (
                      <div>
                        <label className="label-text">Entregador</label>
                        <select 
                          className="input-field"
                          value={editingPedido.entregador_id || ''}
                          onChange={e => setEditingPedido({...editingPedido, entregador_id: e.target.value})}
                        >
                          <option value="">Não atribuído</option>
                          {entregadores.map(e => (
                            <option key={e.id} value={e.id}>{e.nome}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="label-text">Quantidade</label>
                    <input 
                      type="number" 
                      className="input-field"
                      value={editingPedido.quantidade}
                      onChange={e => setEditingPedido({...editingPedido, quantidade: parseInt(e.target.value)})}
                      required
                      min="1"
                    />
                  </div>
                  {editingPedido.tipo_entrega === 'Entrega' && (
                    <div>
                      <label className="label-text">Endereço</label>
                      <textarea 
                        className="input-field h-20"
                        value={editingPedido.endereco || ''}
                        onChange={e => setEditingPedido({...editingPedido, endereco: e.target.value})}
                        required
                      />
                    </div>
                  )}
                  
                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setEditingPedido(null)}
                      className="flex-1 px-6 py-3 border border-stone-700 text-stone-400 font-bold rounded-xl hover:bg-stone-800 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      className="flex-1 gold-button"
                    >
                      Salvar Alterações
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Entregador Details Modal */}
        <AnimatePresence>
          {selectedEntregador && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md overflow-y-auto">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="wood-card w-full max-w-2xl p-8 relative my-8"
              >
                <button 
                  onClick={() => setSelectedEntregador(null)}
                  className="absolute top-4 right-4 p-2 text-stone-500 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>

                <div className="flex items-center gap-4 mb-8">
                  <div className="w-16 h-16 bg-amber-600/10 rounded-full flex items-center justify-center border border-amber-600/20">
                    <User className="w-8 h-8 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-white font-serif">{selectedEntregador.nome}</h3>
                    <div className="flex items-center gap-4 mt-1">
                      {selectedEntregador.whatsapp && (
                        <p className="text-stone-400 text-sm flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" /> {selectedEntregador.whatsapp}
                        </p>
                      )}
                      <p className="text-stone-500 text-xs">Código: {selectedEntregador.codigo}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-2 p-2 bg-stone-800/50 rounded border border-stone-700/50">
                      <p className="text-[10px] text-stone-400 font-mono truncate flex-1">
                        {`${window.location.href.split('#')[0]}#/admin/entregador/${selectedEntregador.codigo}`}
                      </p>
                      <button 
                        onClick={() => {
                          const baseUrl = window.location.href.split('#')[0];
                          copyToClipboard(`${baseUrl}#/admin/entregador/${selectedEntregador.codigo}`);
                        }}
                        className="p-1.5 text-amber-500 hover:bg-amber-500/10 rounded transition-all"
                        title="Copiar link"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Pending Deliveries */}
                  <div>
                    <h4 className="text-amber-500 font-bold uppercase text-xs tracking-widest mb-4 flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Entregas Pendentes
                    </h4>
                    <div className="space-y-3">
                      {pedidos.filter(p => p.entregador_id === selectedEntregador.id && p.status_retirada !== 'Entregue').length > 0 ? (
                        pedidos
                          .filter(p => p.entregador_id === selectedEntregador.id && p.status_retirada !== 'Entregue')
                          .map(p => (
                            <div key={p.id} className="p-3 bg-stone-800/30 rounded-lg border border-stone-700/30">
                              <div className="flex justify-between items-start mb-1">
                                <p className="font-bold text-white text-sm">{p.nome}</p>
                                <span className="text-[10px] bg-amber-900/30 text-amber-500 px-1.5 py-0.5 rounded font-mono font-bold">
                                  {p.numero_pedido}
                                </span>
                              </div>
                              <p className="text-stone-500 text-[10px] mb-2 flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {p.endereco}
                              </p>
                              <button 
                                onClick={() => toggleRetirada(p.id, 'Pendente')}
                                className="w-full py-1.5 bg-green-600/20 text-green-500 text-[10px] font-bold uppercase rounded hover:bg-green-600/30 transition-all border border-green-600/30"
                              >
                                Marcar como Entregue
                              </button>
                            </div>
                          ))
                      ) : (
                        <p className="text-stone-600 text-sm italic">Nenhuma entrega pendente.</p>
                      )}
                    </div>
                  </div>

                  {/* Completed Deliveries */}
                  <div>
                    <h4 className="text-green-500 font-bold uppercase text-xs tracking-widest mb-4 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" /> Entregas Realizadas
                    </h4>
                    <div className="space-y-3">
                      {pedidos.filter(p => p.entregador_id === selectedEntregador.id && p.status_retirada === 'Entregue').length > 0 ? (
                        pedidos
                          .filter(p => p.entregador_id === selectedEntregador.id && p.status_retirada === 'Entregue')
                          .map(p => (
                            <div key={p.id} className="p-3 bg-stone-900/30 rounded-lg border border-stone-800/30 opacity-60">
                              <div className="flex justify-between items-start mb-1">
                                <p className="font-bold text-stone-300 text-sm">{p.nome}</p>
                                <span className="text-[10px] bg-stone-800 text-stone-500 px-1.5 py-0.5 rounded font-mono font-bold">
                                  {p.numero_pedido}
                                </span>
                              </div>
                              <p className="text-stone-600 text-[10px] flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> 
                                {p.delivered_at ? `Entregue em ${new Date(p.delivered_at).toLocaleString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}` : `Entregue em ${new Date(p.created_at).toLocaleDateString()}`}
                              </p>
                            </div>
                          ))
                      ) : (
                        <p className="text-stone-600 text-sm italic">Nenhuma entrega realizada.</p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Custom Confirmation Modal */}
        <AnimatePresence>
          {confirmModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="wood-card w-full max-w-sm p-8 text-center"
              >
                <h3 className="text-2xl font-bold text-white font-serif mb-4">{confirmModal.title}</h3>
                <p className="text-stone-400 mb-8">{confirmModal.message}</p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setConfirmModal(null)}
                    className="flex-1 px-6 py-3 border border-stone-700 text-stone-400 font-bold rounded-xl hover:bg-stone-800 transition-all"
                  >
                    Não
                  </button>
                  <button 
                    onClick={confirmModal.onConfirm}
                    className="flex-1 gold-button"
                  >
                    Sim, Confirmar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Scanner Modal */}
        <AnimatePresence>
          {isScannerOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="wood-card w-full max-w-md p-8 relative"
              >
                <button 
                  onClick={() => {
                    setIsScannerOpen(false);
                    setIsScanning(false);
                  }}
                  className="absolute top-4 right-4 p-2 text-stone-500 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>

                <h3 className="text-2xl font-bold text-white font-serif mb-6 text-center">Validar Retirada</h3>

                <div className="space-y-6">
                  {/* Manual Input */}
                  <div>
                    <label className="text-stone-500 text-[10px] uppercase tracking-widest font-bold mb-2 block">Código do Voucher</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        className="input-field flex-1 uppercase font-mono"
                        placeholder="EX: VOUCH-1234"
                        value={voucherInput}
                        onChange={e => setVoucherInput(e.target.value)}
                      />
                      <button 
                        onClick={() => handleValidateVoucher(voucherInput.toUpperCase())}
                        className="gold-button px-4"
                      >
                        <Search className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="relative py-4 flex items-center">
                    <div className="flex-grow border-t border-stone-800"></div>
                    <span className="flex-shrink mx-4 text-stone-600 text-xs uppercase font-bold">ou use a câmera</span>
                    <div className="flex-grow border-t border-stone-800"></div>
                  </div>

                  {/* Camera Scanner */}
                  {!isScanning ? (
                    <div className="space-y-4">
                      {scannerError && (
                        <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg flex items-start gap-2">
                          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                          <p className="text-red-400 text-xs leading-relaxed">{scannerError}</p>
                        </div>
                      )}
                      <button 
                        onClick={() => setIsScanning(true)}
                        className="w-full py-4 bg-stone-800 border border-stone-700 rounded-xl text-white font-bold flex items-center justify-center gap-3 hover:bg-stone-700 transition-all"
                      >
                        <QrCode className="w-6 h-6 text-amber-500" /> 
                        {scannerError ? 'Tentar Câmera Novamente' : 'Ativar Câmera'}
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border-2 border-amber-500/30 bg-black aspect-square relative flex items-center justify-center">
                      <div id="admin-reader" className="w-full h-full"></div>
                      <div className="absolute inset-0 border-2 border-amber-500/30 pointer-events-none rounded-xl">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-amber-500/50 rounded-lg"></div>
                      </div>
                      <button 
                        onClick={() => setIsScanning(false)}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-full shadow-lg z-10"
                      >
                        Parar Câmera
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Order Confirmation Modal (Scanner) */}
        <AnimatePresence>
          {scannedOrder && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="wood-card w-full max-w-md p-8 relative"
              >
                <button 
                  onClick={() => setScannedOrder(null)}
                  className="absolute top-4 right-4 p-2 text-stone-500 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>

                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20 mx-auto mb-4">
                    <Package className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-white font-serif">Validar Retirada</h3>
                  <p className="text-stone-500 text-sm">Confirme os dados antes de entregar</p>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="p-4 bg-stone-800/30 rounded-xl border border-stone-700/30">
                    <p className="text-stone-500 text-[10px] uppercase font-bold mb-1">Cliente</p>
                    <p className="text-white font-bold text-lg">{scannedOrder.nome}</p>
                    <p className="text-stone-400 text-sm">{scannedOrder.whatsapp}</p>
                  </div>

                  <div className="p-4 bg-stone-800/30 rounded-xl border border-stone-700/30">
                    <p className="text-stone-500 text-[10px] uppercase font-bold mb-1">Pedido</p>
                    <div className="flex justify-between items-center">
                      <p className="text-white font-bold">{scannedOrder.quantidade}x Tambaqui Assado</p>
                      <span className="text-amber-500 font-mono font-bold">{scannedOrder.numero_pedido}</span>
                    </div>
                    <p className="text-stone-400 text-xs mt-2 flex items-center gap-1">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${scannedOrder.tipo_entrega === 'Entrega' ? 'bg-blue-900/30 text-blue-400' : 'bg-stone-700 text-stone-300'}`}>
                        {scannedOrder.tipo_entrega}
                      </span>
                    </p>
                  </div>

                  <div className="p-4 bg-amber-900/10 rounded-xl border border-amber-500/20">
                    <p className="text-amber-500 text-[10px] uppercase font-bold mb-1 text-center">Voucher Validado</p>
                    <p className="text-white font-mono font-bold text-center text-xl tracking-widest">{scannedOrder.voucher}</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setScannedOrder(null)}
                    className="flex-1 px-6 py-4 border border-stone-700 text-stone-400 font-bold rounded-xl hover:bg-stone-800 transition-all font-sans"
                  >
                    {scannedOrder.status_retirada === 'Entregue' ? 'Fechar' : 'Cancelar'}
                  </button>
                  {scannedOrder.status_retirada !== 'Entregue' && (
                    <button 
                      onClick={() => confirmPickup(scannedOrder.id)}
                      className="flex-1 py-4 bg-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-900/20 hover:bg-green-500 transition-all flex items-center justify-center gap-2 font-sans"
                    >
                      <CheckCircle className="w-5 h-5" /> Confirmar
                    </button>
                  )}
                </div>

                {/* Concluded Seal Overlay */}
                {scannedOrder.status_retirada === 'Entregue' && (
                  <div className="stamp-seal animate-stamp">
                    <div className="stamp-inner">
                      <span className="stamp-text">Entregue</span>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Success Modal */}
        <AnimatePresence>
          {showSuccessModal && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                className="wood-card w-full max-w-sm p-8 text-center relative overflow-hidden"
              >
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-green-500/10 rounded-full blur-3xl animate-pulse" />
                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl animate-pulse" />

                <div className="relative z-10">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.2 }}
                    className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-900/40"
                  >
                    <CheckCircle className="w-10 h-10 text-stone-950" />
                  </motion.div>

                  <h3 className="text-3xl font-bold text-white font-serif mb-2">Sucesso!</h3>
                  <p className="text-stone-400 mb-8">A retirada foi realizada e registrada no sistema com sucesso.</p>

                  <button 
                    onClick={() => setShowSuccessModal(false)}
                    className="w-full py-4 bg-stone-800 border border-stone-700 text-white font-bold rounded-xl hover:bg-stone-700 transition-all shadow-lg"
                  >
                    Fechar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Custom Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className={`fixed bottom-8 right-8 z-[70] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border ${
                toast.type === 'success' ? 'bg-green-900/90 border-green-500 text-green-100' : 'bg-red-900/90 border-red-500 text-red-100'
              }`}
            >
              {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <X className="w-5 h-5" />}
              <span className="font-bold">{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* View Comprovante Modal */}
        <AnimatePresence>
          {viewingComprovante && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative max-w-4xl w-full bg-stone-900 rounded-[2rem] overflow-hidden shadow-2xl border border-white/10"
              >
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-stone-900/50 backdrop-blur-md">
                  <div>
                    <h3 className="text-white font-bold flex items-center gap-2 text-lg">
                      <ImageIcon className="w-6 h-6 text-amber-500" /> Comprovante de Pagamento
                    </h3>
                    <p className="text-stone-500 text-xs font-medium uppercase tracking-wider mt-1">Verificação de Transação PIX</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <a 
                      href={viewingComprovante} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-3 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-xl transition-all border border-white/5"
                      title="Abrir em nova aba"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                    <button 
                      onClick={() => setViewingComprovante(null)}
                      className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all border border-red-500/20"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>
                <div className="p-8 flex justify-center bg-espresso min-h-[300px] max-h-[75vh] overflow-auto custom-scrollbar">
                  <img 
                    src={viewingComprovante} 
                    alt="Comprovante" 
                    className="max-w-full h-auto rounded-2xl shadow-2xl border border-white/10" 
                  />
                </div>
                <div className="p-4 bg-stone-900/80 border-t border-white/5 text-center">
                  <button 
                    onClick={() => setViewingComprovante(null)}
                    className="text-stone-400 hover:text-white text-xs font-bold uppercase tracking-widest"
                  >
                    Fechar Visualização
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
