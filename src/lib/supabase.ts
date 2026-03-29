import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── TYPES ─────────────────────────────────────────────────────────────────────

export type Pedido = {
  id: string;
  numero_pedido: string;
  nome: string;
  whatsapp: string;
  tipo_entrega: 'Retirada' | 'Entrega';
  endereco: string | null;
  pagamento: 'PIX' | 'Cartão' | 'Dinheiro';
  status_pagamento: 'Pendente' | 'Pago';
  status_retirada: 'Pendente' | 'Entregue';
  quantidade: number;
  created_at: string;
  delivered_at?: string | null;
  voucher?: string;
  entregador_id?: string | null;
  comprovante_url?: string | null;
};

export type Entregador = {
  id: string;
  nome: string;
  whatsapp: string;
  codigo: string;
  created_at: string;
};

export type Configuracoes = {
  id: number;
  limite_total: number;
  valor: number;
  chave_pix: string;
  evento_nome: string;
  entrega_ativa: boolean;
  vendas_encerradas: boolean;
  mensagem_voucher?: string;
};

export type AdminPerfil = {
  id?: string;
  usuario: string;
  senha: string;
};

export type Notificacao = {
  id: string;
  mensagem: string;
  data: string;
  lida: boolean;
  publico: 'admin' | 'entregador' | 'todos';
};

export type AuditoriaLog = {
  id: string;
  usuario: string;
  acao: string;
  detalhes: string;
  created_at: string;
};

// ─── SUPABASE SERVICE ─────────────────────────────────────────────────────────

export const supabaseService = {
  // ─── AUDITORIA ──────────────────────────────────────────────
  getAuditoria: async (): Promise<AuditoriaLog[]> => {
    const { data, error } = await supabase
      .from('auditoria')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('Erro na auditoria:', error);
      return [];
    }
    return data || [];
  },

  addAuditoria: async (acao: string, detalhes: string): Promise<void> => {
    const usuario = localStorage.getItem('admin_user') || 'Sistema';
    await supabase.from('auditoria').insert({
      usuario,
      acao,
      detalhes
    });
  },

  // ─── CONFIGURATION ────────────────────────────────────────
  getConfig: async (): Promise<Configuracoes> => {
    const { data, error } = await supabase
      .from('configuracoes')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;
    return data;
  },

  getAdminPerfis: async (): Promise<AdminPerfil[]> => {
    const { data, error } = await supabase
      .from('admin_perfil')
      .select('*')
      .order('usuario');
    if (error) {
      console.error('Error fetching admin profiles:', error);
      return [];
    }
    return data || [];
  },

  updateAdminPerfil: async (perfil: AdminPerfil): Promise<void> => {
    if (!perfil.id) return;
    const { error } = await supabase
      .from('admin_perfil')
      .update({ usuario: perfil.usuario, senha: perfil.senha })
      .eq('id', perfil.id);
    if (error) throw error;
    await supabaseService.addAuditoria('Edição de Acesso', `Administrador '${perfil.usuario}' foi editado.`);
  },

  addAdminPerfil: async (usuario: string, senha: string): Promise<void> => {
    const { error } = await supabase
      .from('admin_perfil')
      .insert({ usuario, senha });
    if (error) throw error;
    await supabaseService.addAuditoria('Criação de Acesso', `Novo administrador criado: '${usuario}'`);
  },

  deleteAdminPerfil: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('admin_perfil')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await supabaseService.addAuditoria('Exclusão de Acesso', `Administrador com ID ${id} foi removido do sistema.`);
  },

  saveConfig: async (config: Configuracoes): Promise<void> => {
    const { error } = await supabase
      .from('configuracoes')
      .update({
        limite_total: config.limite_total,
        valor: config.valor,
        chave_pix: config.chave_pix,
        evento_nome: config.evento_nome,
        entrega_ativa: config.entrega_ativa,
        vendas_encerradas: config.vendas_encerradas,
        mensagem_voucher: config.mensagem_voucher,
      })
      .eq('id', 1);
    if (error) throw error;
    await supabaseService.addAuditoria('Configuração Alterada', `As configurações gerais do painel foram atualizadas.`);
  },

  // ─── ORDERS ──────────────────────────────────────────────
  getPedidos: async (): Promise<Pedido[]> => {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  addPedido: async (
    pedido: Omit<Pedido, 'id' | 'created_at' | 'numero_pedido' | 'status_retirada' | 'entregador_id'>
  ): Promise<Pedido> => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const numero_pedido = `#${code}`;

    const { data, error } = await supabase
      .from('pedidos')
      .insert({
        ...pedido,
        numero_pedido,
        status_retirada: 'Pendente',
        entregador_id: null,
      })
      .select()
      .single();
    
    if (error) throw error;

    await supabaseService.reassignOrders();

    const { data: updated } = await supabase
      .from('pedidos')
      .select('*')
      .eq('id', data.id)
      .single();

    const finalPedido: Pedido = updated || data;

    await supabaseService.addNotificacao(
      `Novo pedido ${finalPedido.numero_pedido} de ${finalPedido.nome}!`,
      'admin'
    );
    await supabaseService.addAuditoria('Novo Pedido', `Pedido ${finalPedido.numero_pedido} criado no valor de R$ ${(finalPedido.quantidade * 50).toFixed(2)} (${finalPedido.pagamento})`);

    return finalPedido;
  },

  updatePedido: async (
    id: string,
    updates: Partial<Pedido>
  ): Promise<{ data: Pedido | null; error: unknown }> => {
    const { data: original } = await supabase.from('pedidos').select('*').eq('id', id).single();

    const mods: string[] = [];
    if (original) {
      Object.entries(updates).forEach(([key, val]) => {
        if (key !== 'delivered_at' && original[key as keyof Pedido] !== val) {
          mods.push(`- ${key.toUpperCase()}: de '${original[key as keyof Pedido] || 'Vazio'}' para '${val || 'Vazio'}'`);
        }
      });
    }

    if (updates.status_retirada === 'Entregue') {
      updates.delivered_at = new Date().toISOString();
    } else if (updates.status_retirada === 'Pendente') {
      updates.delivered_at = null;
    }

    const { data, error } = await supabase
      .from('pedidos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return { data: null, error };

    if (mods.length > 0 && original) {
      const detalhesStr = `Pedido ${original.numero_pedido} - Cliente: ${original.nome}\nAlterações feitas:\n${mods.join('\n')}`;
      await supabaseService.addAuditoria('Atualização de Pedido', detalhesStr);
    }

    if (updates.status_pagamento === 'Pago' && data) {
      await supabaseService.addNotificacao(
        `Pagamento confirmado para o pedido ${data.numero_pedido}`,
        'admin'
      );
    }
    if (updates.status_retirada === 'Entregue' && data) {
      await supabaseService.addNotificacao(
        `Pedido ${data.numero_pedido} foi entregue!`,
        'todos'
      );
    }

    return { data, error: null };
  },

  uploadComprovante: async (file: File, pedidoId: string): Promise<string> => {
    // Definir nome do arquivo: id_pedido + timestamp + extensao
    const fileExt = file.name.split('.').pop();
    const fileName = `${pedidoId}_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`; // Salvando na raiz do bucket para simplicidade

    const { error: uploadError, data } = await supabase.storage
      .from('comprovantes')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error detail:', uploadError);
      throw new Error(`Erro no upload: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('comprovantes')
      .getPublicUrl(filePath);

    // Update pedido with URL
    const { error: updateError } = await supabase
      .from('pedidos')
      .update({ comprovante_url: publicUrl })
      .eq('id', pedidoId);

    if (updateError) throw updateError;

    return publicUrl;
  },

  deletePedido: async (id: string): Promise<void> => {
    const { data: original } = await supabase.from('pedidos').select('*').eq('id', id).single();
    const { error } = await supabase.from('pedidos').delete().eq('id', id);
    if (error) throw error;
    
    if (original) {
      const det = `Referência: ${original.numero_pedido}\nCliente: ${original.nome}\nQuantia do Pedido: ${original.quantidade}\nStatus: ${original.status_pagamento}`;
      await supabaseService.addAuditoria('Exclusão de Pedido', det);
    }
  },

  // ─── DRIVERS ─────────────────────────────────────────
  getEntregadores: async (): Promise<Entregador[]> => {
    const { data, error } = await supabase
      .from('entregadores')
      .select('*')
      .order('created_at');
    if (error) throw error;
    return data || [];
  },

  getEntregadorByCodigo: async (codigo: string): Promise<Entregador | undefined> => {
    const { data, error } = await supabase
      .from('entregadores')
      .select('*')
      .eq('codigo', codigo)
      .single();
    if (error) return undefined;
    return data;
  },

  addEntregador: async (
    entregador: Omit<Entregador, 'id' | 'created_at' | 'codigo'>
  ): Promise<Entregador> => {
    const codigo = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    const { data, error } = await supabase
      .from('entregadores')
      .insert({ ...entregador, codigo })
      .select()
      .single();
    if (error) throw error;
    await supabaseService.reassignOrders();
    await supabaseService.addAuditoria('Novo Entregador', `Entregador '${entregador.nome}' foi cadastrado (Código: ${codigo}).`);
    return data;
  },

  deleteEntregador: async (id: string): Promise<void> => {
    const { error } = await supabase.from('entregadores').delete().eq('id', id);
    if (error) throw error;
    await supabaseService.reassignOrders();
    await supabaseService.addAuditoria('Exclusão de Entregador', `Entregador ID ${id} foi removido.`);
  },

  reassignOrders: async (): Promise<void> => {
    const [{ data: deliveryOrders }, { data: drivers }] = await Promise.all([
      supabase.from('pedidos').select('id').eq('tipo_entrega', 'Entrega').order('created_at'),
      supabase.from('entregadores').select('id').order('created_at'),
    ]);

    const orders = deliveryOrders || [];
    const entregadores = drivers || [];

    if (entregadores.length === 0) {
      await supabase
        .from('pedidos')
        .update({ entregador_id: null })
        .eq('tipo_entrega', 'Entrega');
      return;
    }

    for (let i = 0; i < orders.length; i++) {
      const driverIndex = i % entregadores.length;
      await supabase
        .from('pedidos')
        .update({ entregador_id: entregadores[driverIndex].id })
        .eq('id', orders[i].id);
    }
  },

  // ─── NOTIFICATIONS ─────────────────────────────────────────
  getNotificacoes: async (): Promise<Notificacao[]> => {
    const { data, error } = await supabase
      .from('notificacoes')
      .select('*')
      .order('data', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data || []).map((n) => ({
      ...n,
      data: n.data || new Date().toISOString(),
    }));
  },

  addNotificacao: async (
    mensagem: string,
    publico: 'admin' | 'entregador' | 'todos'
  ): Promise<void> => {
    await supabase.from('notificacoes').insert({ mensagem, publico });
  },

  markNotificacaoLida: async (
    id: string,
    _tipoPublico: 'admin' | 'entregador'
  ): Promise<void> => {
    await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
  },
};

// Alias for compatibility
export const mockService = supabaseService;
