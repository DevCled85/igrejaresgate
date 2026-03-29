import React, { useState, useEffect, useRef } from 'react';
import { mockService, type Pedido, type Configuracoes } from '../lib/supabase';
import { formatCurrency, cn, generatePixPayload, copyToClipboard } from '../lib/utils';
import { Fish, MapPin, Truck, Wallet, QrCode, Loader2, CheckCircle2, Copy, X, Download, Calendar, Camera, Image as ImageIcon, ShieldCheck, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { toPng } from 'html-to-image';
import bannerImg from '../images/Banner_resgate.png';

export default function Home() {
  const [config, setConfig] = useState<Configuracoes | null>(null);
  const [vendidos, setVendidos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'order' | 'voucher' | null>(null);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [lastOrder, setLastOrder] = useState<Pedido | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [voucherSearch, setVoucherSearch] = useState({ identifier: '', voucher: '' });
  const [foundVoucher, setFoundVoucher] = useState<Pedido | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const voucherRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [copied, setCopied] = useState(false);
  const [paymentJustConfirmed, setPaymentJustConfirmed] = useState(false);

  const [formData, setFormData] = useState({
    nome: '',
    whatsapp: '',
    tipo_entrega: 'Retirada' as 'Retirada' | 'Entrega',
    endereco: '',
    pagamento: 'PIX' as 'PIX' | 'Cartão' | 'Dinheiro',
    quantidade: 1
  });

  useEffect(() => {
    fetchData();
    const interval = setInterval(async () => {
      try {
        const configData = await mockService.getConfig();
        if (configData) setConfig(configData);
        await fetchVendidos();
      } catch (err) {
        console.error('Error in interval fetch:', err);
      }
    }, 2000);
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(clockInterval);
    };
  }, []);

  useEffect(() => {
    if (config && !config.entrega_ativa && formData.tipo_entrega === 'Entrega') {
      setFormData(prev => ({ ...prev, tipo_entrega: 'Retirada' }));
    }
    if (config && !config.chave_pix && formData.pagamento === 'PIX') {
      setFormData(prev => ({ ...prev, pagamento: 'Dinheiro' }));
    }
  }, [config?.entrega_ativa, config?.chave_pix, formData.tipo_entrega, formData.pagamento]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Polling para atualizar o status do voucher encontrado em tempo real
  useEffect(() => {
    if (!foundVoucher || foundVoucher.status_retirada === 'Entregue') return;

    const pollInterval = setInterval(async () => {
      try {
        const pedidos = await mockService.getPedidos();
        const updated = pedidos.find(p => p.id === foundVoucher.id);
        if (updated) {
          if (updated.status_retirada === 'Entregue') {
             setFoundVoucher(updated);
             setToast({ message: 'Entrega confirmada!', type: 'success' });
          } else if (updated.status_pagamento === 'Pago' && foundVoucher.status_pagamento !== 'Pago') {
             setPaymentJustConfirmed(true);
             setToast({ message: 'Pagamento Confirmado!', type: 'success' });
             setTimeout(() => {
               setFoundVoucher(null);
               setPaymentJustConfirmed(false);
             }, 3000);
          } else if (!paymentJustConfirmed) {
             setFoundVoucher(updated);
          }
        }
      } catch (err) {
        console.error('Erro ao poll status do voucher:', err);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [foundVoucher, paymentJustConfirmed]);

  // Polling para o pedido recém-criado (Sucesso imediato)
  useEffect(() => {
    if (!lastOrder || !orderSuccess || lastOrder.status_retirada === 'Entregue') return;

    const pollInterval = setInterval(async () => {
      try {
        const pedidos = await mockService.getPedidos();
        const updated = pedidos.find(p => p.id === lastOrder.id);
        if (updated) {
          if (updated.status_retirada === 'Entregue') {
            setLastOrder(updated);
            setToast({ message: 'Seu pedido foi entregue!', type: 'success' });
          } else if (updated.status_pagamento === 'Pago' && lastOrder.status_pagamento !== 'Pago') {
            setPaymentJustConfirmed(true);
            setToast({ message: 'Pagamento Confirmado!', type: 'success' });
            setTimeout(() => {
              setOrderSuccess(false);
              setPaymentJustConfirmed(false);
            }, 3000);
          } else if (!paymentJustConfirmed) {
            setLastOrder(updated);
          }
        }
      } catch (err) {
        console.error('Erro ao poll status do lastOrder:', err);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [lastOrder, orderSuccess, paymentJustConfirmed]);

  async function fetchData() {
    setLoading(true);
    try {
      const configData = await mockService.getConfig();
      setConfig(configData);
      await fetchVendidos();
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchVendidos() {
    const pedidos = await mockService.getPedidos();
    const total = pedidos.reduce((acc, curr) => acc + curr.quantidade, 0);
    setVendidos(total);
  }

  const handleFinalizeOrder = () => {
    if (!lastOrder) return;
    
    const message = `*✅ SEU PEDIDO FOI RECEBIDO!*\n\n` +
      `*Número do Pedido:* ${lastOrder.numero_pedido}\n` +
      `*Nome:* ${lastOrder.nome}\n` +
      `*Quantidade:* ${lastOrder.quantidade}x Tambaqui\n` +
      `*Retirada/Entrega:* ${lastOrder.tipo_entrega}\n` +
      `${lastOrder.tipo_entrega === 'Entrega' && lastOrder.endereco ? `*Endereço:* ${lastOrder.endereco}\n` : ''}` +
      `*Pagamento:* ${lastOrder.pagamento}\n` +
      `*Total:* ${formatCurrency((config?.valor || 50) * lastOrder.quantidade)}\n\n` +
      `Agradecemos a sua preferência! Para acompanhar seu pedido, digite seu nome ou número do pedido na Área de Busca do nosso site.`;
      
    const whatsappClean = lastOrder.whatsapp.replace(/\D/g, '');
    const encodedMessage = encodeURIComponent(message);
    
    setOrderSuccess(false);
    window.open(`https://wa.me/55${whatsappClean}?text=${encodedMessage}`, '_blank');
  };

  const handleWhatsAppChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    if (value.length > 10) {
      value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    } else if (value.length > 6) {
      value = `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
    } else if (value.length > 2) {
      value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    } else if (value.length > 0) {
      value = `(${value}`;
    }
    setFormData({ ...formData, whatsapp: value });
  };

  const handleVoucherSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setFoundVoucher(null);

    const pedidos = await mockService.getPedidos();
    const searchId = voucherSearch.identifier.trim().toLowerCase();

    if (!searchId) {
      setToast({ message: 'Informe o nome ou número do pedido.', type: 'error' });
      return;
    }

    // Busca exata pelo número do pedido ou busca parcial pelo nome
    const match = pedidos.find(p => 
      p.numero_pedido.toLowerCase() === searchId || 
      p.numero_pedido.toLowerCase() === `#${searchId}` ||
      p.nome.toLowerCase().includes(searchId)
    );

    if (match) {
      setFoundVoucher(match);
      setVoucherSearch({ identifier: '', voucher: '' });
    } else {
      setToast({ message: 'Pedido não encontrado. Verifique os dados.', type: 'error' });
    }
  };

  const downloadVoucher = async () => {
    if (!voucherRef.current || !foundVoucher) return;
    setDownloading(true);
    
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const element = voucherRef.current;
      const width = element.offsetWidth;
      const height = element.offsetHeight;

      const dataUrl = await toPng(element, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 3,
        width: width,
        height: height,
        style: {
          margin: '0',
          padding: '0',
          transform: 'none',
          animation: 'none',
          transition: 'none',
          boxShadow: 'none',
          border: 'none'
        }
      });

      const link = document.createElement('a');
      link.download = `voucher-${foundVoucher.numero_pedido}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Erro ao baixar voucher:', err);
      setToast({ message: 'Erro ao gerar imagem do voucher.', type: 'error' });
    } finally {
      setDownloading(false);
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const whatsappDigits = formData.whatsapp.replace(/\D/g, '');
    if (whatsappDigits.length < 10) { 
      setToast({ message: 'WhatsApp inválido!', type: 'error' }); 
      return; 
    }
    if (!config || vendidos >= config.limite_total || config.vendas_encerradas) return;
    if (formData.pagamento === 'PIX' && !config.chave_pix) { 
      setToast({ message: 'PIX indisponível no momento.', type: 'error' }); 
      return; 
    }

    setSubmitting(true);
    try {
      const newPedido = await mockService.addPedido({
        nome: formData.nome,
        whatsapp: formData.whatsapp,
        tipo_entrega: formData.tipo_entrega,
        endereco: formData.tipo_entrega === 'Entrega' ? formData.endereco : null,
        pagamento: formData.pagamento,
        quantidade: formData.quantidade,
        status_pagamento: 'Pendente'
      });
      setLastOrder(newPedido);
      setOrderSuccess(true);
      setActiveTab(null);
      setFormData({ 
        nome: '', 
        whatsapp: '', 
        tipo_entrega: 'Retirada', 
        endereco: '', 
        pagamento: config.chave_pix ? 'PIX' : 'Dinheiro', 
        quantidade: 1 
      });
      await fetchVendidos();
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao processar pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  const handleCopyPix = async () => {
    // Determine which order to use based on which view is open
    const pedido = activeTab === 'voucher' && foundVoucher ? foundVoucher : lastOrder;
    if (!pedido) return;
    
    const payload = generatePixPayload(
      config?.chave_pix || '', 
      (config?.valor || 50) * pedido.quantidade, 
      pedido.numero_pedido.replace('#', 'PD')
    );
    const success = await copyToClipboard(payload);
    if (success) {
      setToast({ message: 'Código PIX copiado!', type: 'success' });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setToast({ message: 'Erro ao copiar codigo.', type: 'error' });
    }
  };

  const handleDownloadQR = async () => {
    if (!qrRef.current || !lastOrder) return;
    try {
      const dataUrl = await toPng(qrRef.current, { backgroundColor: '#ffffff', pixelRatio: 3 });
      const link = document.createElement('a');
      link.download = `qr-pix-${lastOrder.numero_pedido}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Erro ao baixar QR code:', err);
    }
  };

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>, target: 'last' | 'found' = 'last') => {
    const file = e.target.files?.[0];
    const pedido = target === 'last' ? lastOrder : foundVoucher;
    if (!file || !pedido) return;

    setUploadingReceipt(true);
    try {
      const publicUrl = await mockService.uploadComprovante(file, pedido.id);
      if (target === 'last') {
        setLastOrder(prev => prev ? { ...prev, comprovante_url: publicUrl } : null);
      } else {
        setFoundVoucher(prev => prev ? { ...prev, comprovante_url: publicUrl } : null);
      }
      setToast({ message: 'Comprovante enviado com sucesso!', type: 'success' });
    } catch (err: any) {
      console.error('Erro ao enviar comprovante:', err);
      setToast({ message: err.message || 'Erro ao enviar comprovante.', type: 'error' });
    } finally {
      setUploadingReceipt(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen text-amber-500"><Loader2 className="animate-spin" /></div>;

  const restantes = config ? Math.max(0, config.limite_total - vendidos) : 0;
  const isSoldOut = restantes <= 0 || config?.vendas_encerradas;

  return (
    <div className="max-w-md mx-auto px-4 py-8 bg-espresso min-h-screen">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
        <img src={bannerImg} alt="Banner" className="w-full h-auto rounded-3xl shadow-xl mb-6 border border-white/5" />
        <div className="flex justify-center -mt-12 mb-6">
          <div className="p-4 bg-amber-600 rounded-full border-4 border-espresso shadow-xl">
            <Fish className="w-10 h-10 text-white" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white mb-1 font-serif">{config?.evento_nome}</h1>
        <p className="text-amber-500/80 text-xs font-bold uppercase tracking-widest">Igreja Resgate • Ação Solidária</p>
      </motion.div>

      <div className="mb-8 flex justify-center">
        <div className="px-4 py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl flex items-center gap-3 text-stone-400">
          <Calendar className="w-4 h-4 text-amber-500/60" />
          <span className="text-xs font-medium capitalize">
            {new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(currentTime)}
          </span>
        </div>
      </div>

      <div className="space-y-4 relative z-10 mb-10">
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={() => setActiveTab(activeTab === 'voucher' ? null : 'voucher')}
          className={cn(
            "w-full p-4 rounded-2xl flex items-center justify-between border transition-all duration-300",
            activeTab === 'voucher' ? "bg-stone-800 border-amber-500" : "bg-gradient-to-r from-amber-600 to-amber-700 border-transparent shadow-lg shadow-amber-900/20"
          )}
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-white font-bold text-lg leading-tight uppercase tracking-tight">Resgatar Voucher</p>
              <p className="text-amber-100/60 text-[10px] font-medium">Validar seu pedido pago</p>
            </div>
          </div>
          <div className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold text-white uppercase">
            {activeTab === 'voucher' ? 'Fechar' : 'Acessar'}
          </div>
        </motion.button>

        {!isSoldOut && (
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab(activeTab === 'order' ? null : 'order')}
            className={cn(
              "w-full p-4 rounded-2xl flex items-center justify-between border transition-all duration-300",
              activeTab === 'order' ? "bg-stone-800 border-amber-500" : "bg-gradient-to-r from-stone-800 to-stone-900 border-stone-700 shadow-xl"
            )}
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 bg-amber-600/10 rounded-xl flex items-center justify-center backdrop-blur-sm border border-amber-600/20">
                <Fish className="w-5 h-5 text-amber-500" />
              </div>
              <div className="text-left">
                <p className="text-white font-bold text-lg leading-tight uppercase tracking-tight">Fazer Pedido</p>
                <p className="text-stone-500 text-[10px] font-medium">Comprar seu tambaqui agora</p>
              </div>
            </div>
            <div className="bg-amber-600/20 px-3 py-1 rounded-full text-[10px] font-bold text-amber-500 uppercase">
              {activeTab === 'order' ? 'Fechar' : 'Iniciar'}
            </div>
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {activeTab && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveTab(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md cursor-pointer"
            />
            
            <motion.div
              key={activeTab}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="wood-card p-6 border-amber-500/20 shadow-2xl relative">
                <button 
                  onClick={() => setActiveTab(null)}
                  className="absolute top-4 right-4 text-stone-500 hover:text-white transition-colors z-10"
                >
                  <X className="w-6 h-6" />
                </button>

                {activeTab === 'order' && (
                  <div key="order-pane">
                    <h2 className="text-xl font-bold text-white mb-6 font-serif flex items-center gap-2">
                      <Fish className="w-5 h-5 text-amber-500" /> Fazer Novo Pedido
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="label-text">Nome Completo</label>
                        <input required type="text" className="input-field" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} />
                      </div>
                      <div>
                        <label className="label-text">WhatsApp</label>
                        <input required type="tel" className="input-field" value={formData.whatsapp} onChange={handleWhatsAppChange} placeholder="(00) 00000-0000" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="label-text">Tipo</label>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setFormData({...formData, tipo_entrega: 'Retirada'})} className={cn("flex-1 p-3 rounded-lg border flex flex-col items-center gap-1", formData.tipo_entrega === 'Retirada' ? "bg-amber-600 border-amber-500 text-white" : "bg-espresso border-stone-800 text-stone-500")}>
                              <MapPin className="w-4 h-4" /><span className="text-[10px] font-bold uppercase">Retirada</span>
                            </button>
                            {config?.entrega_ativa && (
                              <button type="button" onClick={() => setFormData({...formData, tipo_entrega: 'Entrega'})} className={cn("flex-1 p-3 rounded-lg border flex flex-col items-center gap-1", formData.tipo_entrega === 'Entrega' ? "bg-amber-600 border-amber-500 text-white" : "bg-espresso border-stone-800 text-stone-500")}>
                                <Truck className="w-4 h-4" /><span className="text-[10px] font-bold uppercase">Entrega</span>
                              </button>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="label-text">Quantidade</label>
                          <div className="flex items-center bg-espresso rounded-lg border border-stone-800 p-1">
                            <button type="button" onClick={() => setFormData({...formData, quantidade: Math.max(1, formData.quantidade - 1)})} className="w-8 h-8 flex items-center justify-center text-amber-500 text-xl font-bold">-</button>
                            <span className="flex-1 text-center text-white font-bold">{formData.quantidade}</span>
                            <button type="button" onClick={() => setFormData({...formData, quantidade: Math.min(restantes, formData.quantidade + 1)})} className="w-8 h-8 flex items-center justify-center text-amber-500 text-xl font-bold">+</button>
                          </div>
                        </div>
                      </div>
                      <AnimatePresence>
                        {formData.tipo_entrega === 'Entrega' && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <label className="label-text">Endereço Completo</label>
                            <textarea required className="input-field h-20 resize-none" value={formData.endereco} onChange={e => setFormData({...formData, endereco: e.target.value})} placeholder="Rua, nº, bairro..." />
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div>
                        <label className="label-text">Pagamento</label>
                        <div className="flex gap-2">
                          {config?.chave_pix && (
                            <button type="button" onClick={() => setFormData({...formData, pagamento: 'PIX'})} className={cn("flex-1 p-3 rounded-lg border flex items-center justify-center gap-2", formData.pagamento === 'PIX' ? "bg-amber-600 border-amber-500 text-white" : "bg-espresso border-stone-800 text-stone-500")}>
                              <QrCode className="w-4 h-4" /><span className="text-xs font-bold uppercase">PIX</span>
                            </button>
                          )}
                          <button type="button" onClick={() => setFormData({...formData, pagamento: 'Dinheiro'})} className={cn("flex-1 p-3 rounded-lg border flex items-center justify-center gap-2", formData.pagamento === 'Dinheiro' ? "bg-amber-600 border-amber-500 text-white" : "bg-espresso border-stone-800 text-stone-500")}>
                            <Wallet className="w-4 h-4" /><span className="text-xs font-bold uppercase">Dinheiro</span>
                          </button>
                        </div>
                      </div>
                      <div className="bg-stone-900/50 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                        <div><p className="text-stone-500 text-[10px] uppercase font-bold">Total</p><p className="text-green-400 font-bold text-xl">{formatCurrency((config?.valor || 50) * formData.quantidade)}</p></div>
                        <button type="submit" disabled={submitting} className="gold-button px-8 py-3">{submitting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Confirmar'}</button>
                      </div>
                    </form>
                  </div>
                )}

                {activeTab === 'voucher' && (
                  <div key="voucher-pane">
                    {!foundVoucher ? (
                      <form onSubmit={handleVoucherSearch} className="space-y-6">
                        <div className="text-center">
                          <QrCode className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                          <h2 className="text-xl font-bold text-white font-serif tracking-tight">Resgatar Comprovante</h2>
                          <p className="text-stone-400 text-xs mt-1">Informe seus dados para localizar seu pedido</p>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="label-text">Nome ou Nº Pedido</label>
                            <input 
                              required 
                              className="input-field" 
                              placeholder="Ex: João Silva ou #0042"
                              value={voucherSearch.identifier} 
                              onChange={e => setVoucherSearch({...voucherSearch, identifier: e.target.value})} 
                            />
                          </div>
                        </div>
                        <button type="submit" className="gold-button w-full h-14 text-lg">Localizar Pedido</button>
                      </form>
                    ) : (
                      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {foundVoucher.status_pagamento === 'Pago' ? (
                          <>
                            {foundVoucher.status_retirada === 'Entregue' ? (
                              <div className="wood-card p-10 flex flex-col items-center text-center space-y-8 border-green-500/30 shadow-[0_0_50px_rgba(34,197,94,0.1)]">
                                <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-900/40 animate-bounce-subtle">
                                  <CheckCircle2 className="w-14 h-14 text-white" />
                                </div>
                                <div>
                                  <h2 className="text-3xl font-black text-white font-serif tracking-tight uppercase mb-2">Pedido Retirado!</h2>
                                  <p className="text-amber-500 font-bold text-xl mb-4">#{foundVoucher.numero_pedido.replace('#', '')}</p>
                                  <div className="h-px w-20 bg-amber-500/20 mx-auto mb-4" />
                                  <p className="text-stone-400 text-sm leading-relaxed px-4">
                                    Seu tambaqui foi entregue com sucesso.<br/>
                                    <span className="text-white font-bold italic mt-2 block">Obrigado pela preferência!</span>
                                  </p>
                                </div>
                                <button 
                                  onClick={() => setFoundVoucher(null)} 
                                  className="gold-button w-full h-14 text-lg"
                                >
                                  Fazer Nova Busca
                                </button>
                              </div>
                            ) : (
                              <>
                                <div ref={voucherRef} className="bg-white rounded-3xl p-8 text-espresso shadow-2xl mb-6 relative overflow-hidden">
                                  <div className="absolute top-0 left-0 w-full h-2 bg-amber-500" />
                                  <div className="flex justify-between items-start mb-8 text-left">
                                    <div>
                                      <p className="text-stone-400 text-[10px] uppercase font-black tracking-widest mb-1">Voucher Oficial</p>
                                      <h3 className="text-3xl font-black text-amber-600 font-serif tracking-tighter uppercase leading-none">{foundVoucher.voucher}</h3>
                                    </div>
                                    <div className="flex flex-col items-center gap-1 bg-green-50 border border-green-100 p-3 rounded-2xl shadow-sm">
                                      <div className="w-7 h-7 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-900/20">
                                        <CheckCircle2 className="w-4 h-4 text-white" />
                                      </div>
                                      <span className="text-[7px] font-black text-green-700 uppercase tracking-widest text-center whitespace-nowrap">Pagamento Confirmado</span>
                                    </div>
                                  </div>

                                  <div className="space-y-5 text-left border-y border-stone-100 py-6 mb-8">
                                    <div className="grid grid-cols-1 gap-5">
                                      <div>
                                        <p className="text-stone-400 text-[10px] uppercase font-black tracking-widest mb-1">Portador</p>
                                        <p className="font-black text-xl truncate uppercase text-stone-900 leading-tight">{foundVoucher.nome}</p>
                                      </div>
                                      <div className="flex justify-between border-t border-stone-50 pt-5">
                                        <div>
                                          <p className="text-stone-400 text-[10px] uppercase font-black tracking-widest mb-1">Pedido</p>
                                          <p className="font-black text-stone-900 text-lg">#{foundVoucher.numero_pedido.replace('#', '')}</p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-stone-400 text-[10px] uppercase font-black tracking-widest mb-1">Quantidade</p>
                                          <p className="font-black text-stone-900 text-lg">{foundVoucher.quantidade}x</p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex flex-col items-center justify-center relative py-2 min-h-[180px]">
                                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3">
                                      <QRCodeSVG value={foundVoucher.voucher || ''} size={150} />
                                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Apresentar na Retirada</p>
                                    </motion.div>
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <button 
                                    onClick={downloadVoucher} 
                                    disabled={downloading} 
                                    className="w-full py-5 bg-amber-600 rounded-2xl text-white font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 shadow-xl shadow-amber-950/40 hover:bg-amber-500 transition-all disabled:opacity-50"
                                  >
                                    {downloading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Download className="w-5 h-5" /> Baixar Imagem</>}
                                  </button>
                                  <button 
                                    onClick={() => setFoundVoucher(null)} 
                                    className="w-full py-2 text-stone-500 font-bold uppercase tracking-[0.3em] text-[10px] hover:text-white transition-colors"
                                  >
                                    Nova Busca
                                  </button>
                                </div>
                              </>
                            )}
                          </>
                        ) : paymentJustConfirmed ? (
                          <div className="flex flex-col items-center justify-center py-12 space-y-6 animate-in zoom-in duration-500 min-h-[300px]">
                            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-900/40">
                              <CheckCircle2 className="w-12 h-12 text-white" />
                            </div>
                            <div className="text-center">
                              <h2 className="text-2xl font-black text-white font-serif tracking-tight uppercase mb-2">Pagamento Realizado!</h2>
                              <p className="text-stone-400 text-xs text-balance">O status do seu pedido foi atualizado.</p>
                            </div>
                          </div>
                        ) : (
                          <div className="animate-in fade-in zoom-in duration-500 py-4">
                            <div className="flex flex-col items-center mb-8">
                               <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20 mb-6">
                                 <QrCode className="w-8 h-8 text-amber-500" />
                               </div>
                               <h2 className="text-2xl font-black text-white font-serif tracking-tight uppercase mb-1">Pagamento Pendente</h2>

                               <p className="text-amber-500 font-black text-3xl">#{foundVoucher.numero_pedido.replace('#', '')}</p>
                            </div>
                            <div className="space-y-3 mb-4">
                              <div className="bg-white rounded-2xl p-3 flex flex-col items-center gap-3 overflow-hidden shadow-inner">
                                <div className="bg-white p-1">
                                  <QRCodeSVG value={generatePixPayload(config?.chave_pix || '', (config?.valor || 50) * foundVoucher.quantidade, foundVoucher.numero_pedido.replace('#', 'PD'))} size={120} />
                                </div>
                                <div className="w-full bg-stone-50 rounded-xl p-2 border border-stone-100 text-left cursor-pointer hover:bg-stone-100 transition-colors" onClick={handleCopyPix}>
                                  <p className="text-[8px] uppercase font-black text-stone-400 mb-0.5">Copia e Cola</p>
                                  <p className="text-[7px] font-mono break-all leading-tight text-stone-500 line-clamp-2">
                                    {generatePixPayload(config?.chave_pix || '', (config?.valor || 50) * foundVoucher.quantidade, foundVoucher.numero_pedido.replace('#', 'PD'))}
                                  </p>
                                </div>
                                <button onClick={handleCopyPix} className={cn("w-full py-3 h-11 rounded-xl border font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all", copied ? "bg-green-500/10 border-green-500/50 text-green-600" : "bg-amber-500/5 text-amber-600 border-amber-500/20 hover:bg-amber-500/10")}>
                                  {copied ? <><CheckCircle2 className="w-3 h-3" /> Copiado!</> : <><Copy className="w-3 h-3" /> Copiar Código PIX</>}
                                </button>
                              </div>
                            </div>

                            <div className="space-y-3">
                              {!foundVoucher.comprovante_url ? (
                                <div className="bg-stone-900/40 p-2.5 rounded-xl border border-dashed border-white/5 group hover:border-amber-500/30 transition-colors">
                                  <input type="file" ref={fileInputRef} accept="image/*" onChange={(e) => handleUploadReceipt(e, 'found')} className="hidden" />
                                  <button onClick={() => fileInputRef.current?.click()} disabled={uploadingReceipt} className="w-full flex items-center justify-center gap-3">
                                    {uploadingReceipt ? <Loader2 className="w-5 h-5 text-amber-500 animate-spin" /> : <div className="w-8 h-8 bg-amber-500/10 rounded-full flex items-center justify-center flex-shrink-0"><Camera className="w-4 h-4 text-amber-500" /></div>}
                                    <div className="text-left">
                                      <p className="text-white font-bold text-[10px] tracking-tight">{uploadingReceipt ? 'Enviando...' : 'Anexar Comprovante'}</p>
                                      <p className="text-stone-500 text-[7px] font-medium leading-none">Obrigatório para confirmar</p>
                                    </div>
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  <div className="bg-green-500/5 p-2 rounded-xl border border-green-500/20 flex items-center justify-center gap-2">
                                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                                    <span className="text-green-500 font-bold text-[8px] uppercase tracking-wider">Comprovante Enviado!</span>
                                  </div>
                                  <a 
                                    href={foundVoucher.comprovante_url} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl border border-white/5 font-black uppercase tracking-widest text-[8px] flex items-center justify-center gap-2 transition-all"
                                  >
                                    <ImageIcon className="w-3 h-3 text-amber-500" /> Ver Comprovante
                                  </a>
                                </div>
                              )}
                              <button onClick={() => setFoundVoucher(null)} className="w-full py-2 text-stone-500 font-black uppercase tracking-[0.3em] text-[10px] hover:text-white transition-colors mt-2">Voltar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {orderSuccess && lastOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="wood-card w-full max-w-sm p-4 text-center border-green-500/30 max-h-[96vh] overflow-y-auto no-scrollbar">
            {paymentJustConfirmed ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-6 animate-in zoom-in duration-500 min-h-[300px]">
                <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-900/40">
                  <CheckCircle2 className="w-12 h-12 text-white" />
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-black text-white font-serif tracking-tight uppercase mb-2">Pagamento Realizado!</h2>
                  <p className="text-stone-400 text-xs text-balance">Seu pedido foi confirmado pela nossa equipe.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col items-center mb-4">
                  <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-900/40 mb-2"><CheckCircle2 className="w-8 h-8 text-white" /></div>
                  <h2 className="text-lg font-black text-white font-serif uppercase tracking-tight">Pedido Recebido!</h2>
                  <p className="text-amber-500 font-black text-xl leading-none">{lastOrder.numero_pedido}</p>
                </div>
              
              <div className="space-y-3 mb-4">
                {lastOrder.pagamento === 'PIX' && (
                  <div className="bg-white rounded-2xl p-3 flex flex-col items-center gap-3 overflow-hidden shadow-inner">
                    {/* Integrated PIX Area (Similar to User Image) */}
                    <div ref={qrRef} className="bg-white p-1">
                      <QRCodeSVG value={generatePixPayload(config?.chave_pix || '', (config?.valor || 50) * lastOrder.quantidade, lastOrder.numero_pedido.replace('#', 'PD'))} size={120} />
                    </div>

                    <div onClick={handleCopyPix} className="w-full p-2 bg-stone-50 rounded-xl border border-stone-100 text-left cursor-pointer transition-all hover:bg-stone-100">
                      <p className="text-[8px] uppercase font-black text-stone-400 mb-0.5">Copia e Cola</p>
                      <p className="text-[7px] font-mono break-all leading-tight text-stone-500">
                        {generatePixPayload(config?.chave_pix || '', (config?.valor || 50) * lastOrder.quantidade, lastOrder.numero_pedido.replace('#', 'PD'))}
                      </p>
                    </div>

                    <button onClick={handleCopyPix} className={cn("w-full py-3 h-11 rounded-xl border font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all", copied ? "bg-green-500/10 border-green-500/50 text-green-600" : "bg-amber-500/5 text-amber-600 border-amber-500/20 hover:bg-amber-500/10")}>
                      {copied ? <><CheckCircle2 className="w-3 h-3" /> Copiado!</> : <><Copy className="w-3 h-3" /> Copiar Código PIX</>}
                    </button>
                  </div>
                )}

                {lastOrder.pagamento === 'PIX' && (
                  <div className="space-y-3">
                    {!lastOrder.comprovante_url ? (
                      <div className="bg-stone-900/40 p-2.5 rounded-xl border border-dashed border-white/5 group hover:border-amber-500/30 transition-colors">
                        <input type="file" ref={fileInputRef} accept="image/*" onChange={handleUploadReceipt} className="hidden" />
                        <button onClick={() => fileInputRef.current?.click()} disabled={uploadingReceipt} className="w-full flex items-center justify-center gap-3">
                          {uploadingReceipt ? <Loader2 className="w-5 h-5 text-amber-500 animate-spin" /> : <div className="w-8 h-8 bg-amber-500/10 rounded-full flex items-center justify-center flex-shrink-0"><Camera className="w-4 h-4 text-amber-500" /></div>}
                          <div className="text-left">
                            <p className="text-white font-bold text-[10px] tracking-tight">{uploadingReceipt ? 'Enviando...' : 'Anexar Comprovante'}</p>
                            <p className="text-stone-500 text-[7px] font-medium leading-none">Obrigatório para confirmar</p>
                          </div>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="bg-green-500/5 p-2 rounded-xl border border-green-500/20 flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                          <span className="text-green-500 font-bold text-[8px] uppercase tracking-wider">Comprovante Enviado!</span>
                        </div>
                        <a 
                          href={lastOrder.comprovante_url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl border border-white/5 font-black uppercase tracking-widest text-[8px] flex items-center justify-center gap-2 transition-all"
                        >
                          <ImageIcon className="w-3 h-3 text-amber-500" /> Ver Comprovante
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button onClick={handleFinalizeOrder} className="gold-button w-full h-12 text-sm uppercase font-black">Finalizar Pedido</button>
              </>
            )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="mt-20 text-center pb-10">
        <p className="text-stone-600 text-[10px] font-bold uppercase tracking-widest leading-loose">
          © {new Date().getFullYear()} Igreja Resgate • Setor 16<br/>
          Todos os direitos reservados
        </p>
      </footer>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border backdrop-blur-md ${toast.type === 'success' ? 'bg-green-600/90 border-green-500/50 text-white' : 'bg-red-600/90 border-red-500/50 text-white'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <X className="w-5 h-5" />}
            <span className="font-bold text-sm tracking-tight">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
