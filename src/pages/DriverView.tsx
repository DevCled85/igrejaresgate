import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { mockService, type Pedido, type Entregador, type Notificacao } from '../lib/supabase';
import { formatWhatsApp, formatMapsUrl } from '../lib/utils';
import { 
  Bell,
  CheckCircle, 
  Clock, 
  MapPin, 
  MessageCircle, 
  Package, 
  User, 
  Loader2,
  AlertCircle,
  QrCode,
  Maximize,
  X,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import logoImg from '../images/Favicon_final.png';

export default function DriverView() {
  const { codigo } = useParams<{ codigo: string }>();
  const [entregador, setEntregador] = useState<Entregador | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [showNotificacoes, setShowNotificacoes] = useState(false);
  const poppedNotifIds = React.useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [voucherInput, setVoucherInput] = useState('');
  const [scannedOrder, setScannedOrder] = useState<Pedido | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [orderToConfirm, setOrderToConfirm] = useState<Pedido | null>(null);

  useEffect(() => {
    if (codigo) {
      fetchData();
      const interval = setInterval(() => {
        fetchData(true);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [codigo]);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;

    if (isScannerOpen && isScanning) {
      scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );

      scanner.render((decodedText) => {
        handleValidateVoucher(decodedText);
        setIsScanning(false);
        if (scanner) scanner.clear();
      }, (error) => {
        // Silent error for scanning
      });
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(err => console.error("Failed to clear scanner", err));
      }
    };
  }, [isScannerOpen, isScanning]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function handleValidateVoucher(voucher: string) {
    const allPedidos = await mockService.getPedidos();
    const order = allPedidos.find(p => p.voucher === voucher);

    if (!order) {
      setToast({ message: 'Voucher não encontrado ou inválido.', type: 'error' });
      return;
    }

    if (order.status_retirada === 'Entregue') {
      setToast({ message: 'Este voucher já foi utilizado.', type: 'error' });
      return;
    }

    setScannedOrder(order);
    setIsScannerOpen(false);
    setVoucherInput('');
  }

  async function confirmDelivery(id: string) {
    try {
      await mockService.updatePedido(id, { status_retirada: 'Entregue' });
      setScannedOrder(null);
      setOrderToConfirm(null);
      setShowSuccessModal(true);
      fetchData();
    } catch (err) {
      console.error('Erro ao confirmar entrega:', err);
      setToast({ message: 'Erro ao confirmar entrega.', type: 'error' });
    }
  }

  async function fetchData(silent = false) {
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const driver = await mockService.getEntregadorByCodigo(codigo || '');
      if (!driver) {
        if (!silent) setError('Entregador não encontrado. Verifique o link.');
        return;
      }
      setEntregador(driver);
      
      const allPedidos = await mockService.getPedidos();
      const driverPedidos = allPedidos.filter(p => p.entregador_id === driver.id);
      setPedidos(driverPedidos.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      }));

      const rawNotifs = await mockService.getNotificacoes();
      const notifsData = rawNotifs.filter(n => n.publico === 'todos' || n.publico === 'entregador');
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
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      if (!silent) setError('Ocorreu um erro ao carregar as informações.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function markAllNotifsAsRead() {
    await Promise.all(
      notificacoes
        .filter(n => !n.lida)
        .map(n => mockService.markNotificacaoLida(n.id, 'entregador'))
    );
    setNotificacoes(notificacoes.map(n => ({ ...n, lida: true })));
  }

  async function toggleRetirada(id: string, currentStatus: string) {
    if (currentStatus === 'Pendente') {
      const order = pedidos.find(p => p.id === id);
      if (order) {
        setOrderToConfirm(order);
        return;
      }
    }

    try {
      const newStatus = currentStatus === 'Entregue' ? 'Pendente' : 'Entregue';
      await mockService.updatePedido(id, { status_retirada: newStatus as any });
      
      if (newStatus === 'Entregue') {
        setShowSuccessModal(true);
      } else {
        setToast({ 
          message: 'Status do pedido alterado para pendente.', 
          type: 'success' 
        });
      }
      fetchData();
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
      setToast({ message: 'Erro ao atualizar status do pedido.', type: 'error' });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-4" />
          <p className="text-stone-400 font-serif italic">Carregando suas entregas...</p>
        </div>
      </div>
    );
  }

  if (error || !entregador) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
        <div className="wood-card p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white font-serif mb-2">Ops!</h2>
          <p className="text-stone-400 mb-6">{error || 'Link inválido.'}</p>
          <button 
            onClick={() => window.location.reload()}
            className="gold-button w-full"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  const pendingOrders = pedidos.filter(p => p.status_retirada !== 'Entregue');
  const completedOrders = pedidos.filter(p => p.status_retirada === 'Entregue');

  return (
    <div className="min-h-screen bg-espresso text-stone-200 pb-20">
      {/* Header */}
      <header className="bg-espresso-light/80 backdrop-blur-md border-b border-amber-900/20 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-600/10 rounded-full flex items-center justify-center border border-amber-600/20 overflow-hidden">
              <img src={logoImg} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white font-serif leading-tight">Painel do Entregador</h1>
              <p className="text-stone-500 text-[10px] uppercase tracking-widest font-bold">Tambaqui Assado</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-white font-bold text-sm">{entregador.nome}</p>
              <p className="text-amber-500 text-[10px] font-mono">{entregador.codigo}</p>
            </div>

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
                    className="absolute top-12 right-0 w-80 max-w-[calc(100vw-2rem)] bg-stone-800 border border-stone-700 rounded-xl shadow-2xl overflow-hidden"
                  >
                    <div className="p-4 bg-stone-900 border-b border-stone-700 flex justify-between items-center">
                      <h3 className="text-white font-bold">Notificações</h3>
                      <button onClick={() => setShowNotificacoes(false)} className="text-stone-400 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notificacoes.length > 0 ? (
                        notificacoes.map(n => (
                          <div key={n.id} className={`p-4 border-b border-stone-700 last:border-0 ${!n.lida ? 'bg-amber-900/10' : ''}`}>
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
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Scanner Banner */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
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
              <h3 className="text-lg font-bold text-white font-serif">Scanner de Entrega</h3>
              <p className="text-stone-400 text-xs">Valide o voucher do cliente para entregar</p>
            </div>
          </div>
          <Maximize className="w-5 h-5 text-amber-500 opacity-50 group-hover:opacity-100 transition-opacity" />
        </motion.button>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="wood-card p-4 text-center">
            <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-stone-500 text-[10px] uppercase font-bold">Pendentes</p>
            <p className="text-2xl font-bold text-white">{pendingOrders.length}</p>
          </div>
          <div className="wood-card p-4 text-center">
            <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
            <p className="text-stone-500 text-[10px] uppercase font-bold">Entregues</p>
            <p className="text-2xl font-bold text-white">{completedOrders.length}</p>
          </div>
        </div>

        {/* Pending Deliveries */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-white font-serif flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" /> Entregas Pendentes
          </h2>
          
          <div className="space-y-4">
            {pendingOrders.length > 0 ? (
              pendingOrders.map(p => (
                <motion.div 
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="wood-card p-5 space-y-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-bold text-white">{p.nome}</h3>
                      <p className="text-stone-500 text-xs font-mono">{p.numero_pedido}</p>
                    </div>
                    <span className="bg-amber-900/30 text-amber-500 px-2 py-1 rounded text-xs font-bold">
                      {p.quantidade}x Peixe
                    </span>
                  </div>

                  <div className="space-y-2">
                    <a 
                      href={formatMapsUrl(p.endereco || '')}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-3 p-3 bg-stone-800/30 rounded-lg border border-stone-700/30 hover:bg-stone-800/50 transition-all group"
                    >
                      <MapPin className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                      <div className="flex-1">
                        <p className="text-stone-300 text-sm leading-relaxed">{p.endereco}</p>
                        <p className="text-amber-500 text-[10px] font-bold uppercase mt-2">
                          Abrir no Google Maps
                        </p>
                      </div>
                    </a>

                    <div className="flex items-center gap-3 p-3 bg-stone-800/30 rounded-lg border border-stone-700/30">
                      <MessageCircle className="w-5 h-5 text-green-500 shrink-0" />
                      <div className="flex-1 flex justify-between items-center">
                        <p className="text-stone-300 text-sm">{p.whatsapp}</p>
                        <a 
                          href={formatWhatsApp(p.whatsapp)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-green-500 text-[10px] font-bold uppercase hover:underline"
                        >
                          Enviar Mensagem
                        </a>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => toggleRetirada(p.id, 'Pendente')}
                    className="w-full py-4 bg-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-900/20 hover:bg-green-500 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" /> Confirmar Entrega
                  </button>
                </motion.div>
              ))
            ) : (
              <div className="wood-card p-12 text-center">
                <Package className="w-12 h-12 text-stone-700 mx-auto mb-4" />
                <p className="text-stone-500 italic font-serif">Nenhuma entrega pendente no momento.</p>
              </div>
            )}
          </div>
        </section>

        {/* Completed Deliveries */}
        {completedOrders.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-stone-400 font-serif flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" /> Entregas Realizadas
            </h2>
            
            <div className="space-y-3">
              {completedOrders.map(p => (
                <div key={p.id} className="wood-card p-4 opacity-60 flex justify-between items-center">
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-bold text-stone-300">{p.nome}</p>
                      <span className="text-[10px] text-green-500 font-mono">
                        {p.delivered_at ? new Date(p.delivered_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        }) : 'Data não registrada'}
                      </span>
                    </div>
                    <p className="text-stone-600 text-[10px] font-mono">{p.numero_pedido}</p>
                  </div>
                  <button 
                    onClick={() => toggleRetirada(p.id, 'Entregue')}
                    className="text-[9px] text-stone-500 uppercase font-bold hover:text-amber-500 ml-4 shrink-0"
                  >
                    Desfazer
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-4 right-4 z-50 flex justify-center"
          >
            <div className={`px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 border ${
              toast.type === 'success' ? 'bg-green-600 border-green-500' : 'bg-red-600 border-red-500'
            }`}>
              {toast.type === 'success' ? <CheckCircle className="w-4 h-4 text-white" /> : <AlertCircle className="w-4 h-4 text-white" />}
              <span className="text-white text-sm font-bold">{toast.message}</span>
            </div>
          </motion.div>
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

              <h3 className="text-2xl font-bold text-white font-serif mb-6 text-center">Validar Entrega</h3>

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
                  <button 
                    onClick={() => setIsScanning(true)}
                    className="w-full py-4 bg-stone-800 border border-stone-700 rounded-xl text-white font-bold flex items-center justify-center gap-3 hover:bg-stone-700 transition-all"
                  >
                    <QrCode className="w-6 h-6 text-amber-500" /> Ativar Câmera
                  </button>
                ) : (
                  <div className="overflow-hidden rounded-xl border-2 border-amber-500/30 bg-black aspect-square relative">
                    <div id="reader" className="w-full h-full"></div>
                    <button 
                      onClick={() => setIsScanning(false)}
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-full shadow-lg"
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

      {/* Order Confirmation Modal */}
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
                <h3 className="text-2xl font-bold text-white font-serif">Validar Pedido</h3>
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
                  <p className="text-stone-400 text-xs mt-2 flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
                    {scannedOrder.endereco}
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
                  className="flex-1 px-6 py-4 border border-stone-700 text-stone-400 font-bold rounded-xl hover:bg-stone-800 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => confirmDelivery(scannedOrder.id)}
                  className="flex-1 py-4 bg-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-900/20 hover:bg-green-500 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" /> Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Order Confirmation Modal (from list) */}
      <AnimatePresence>
        {orderToConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="wood-card w-full max-w-md p-8 relative"
            >
              <button 
                onClick={() => setOrderToConfirm(null)}
                className="absolute top-4 right-4 p-2 text-stone-500 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20 mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-2xl font-bold text-white font-serif">Confirmar Entrega?</h3>
                <p className="text-stone-500 text-sm">Deseja marcar este pedido como entregue?</p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="p-4 bg-stone-800/30 rounded-xl border border-stone-700/30">
                  <p className="text-stone-500 text-[10px] uppercase font-bold mb-1">Cliente</p>
                  <p className="text-white font-bold text-lg">{orderToConfirm.nome}</p>
                  <p className="text-stone-400 text-sm">{orderToConfirm.numero_pedido}</p>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setOrderToConfirm(null)}
                  className="flex-1 px-6 py-4 border border-stone-700 text-stone-400 font-bold rounded-xl hover:bg-stone-800 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => confirmDelivery(orderToConfirm.id)}
                  className="flex-1 py-4 bg-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-900/20 hover:bg-green-500 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" /> Confirmar
                </button>
              </div>
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
              {/* Decorative background elements */}
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
                <p className="text-stone-400 mb-8">A entrega foi realizada e registrada no sistema com sucesso.</p>

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
    </div>
  );
}
