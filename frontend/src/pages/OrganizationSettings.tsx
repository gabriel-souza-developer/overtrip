import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Palette, ShieldAlert, Tag } from 'lucide-react';
import { organizationApi } from '../api/organizations';
import { useToast } from '../hooks/useToast';
import {
  BRAND_COLOR_CONTRAST_MESSAGE,
  BRAND_COLOR_FORMAT_MESSAGE,
  FALLBACK_PALETTE,
  derivePaletteFromBrandColor,
  hasEnoughContrastOnWhite,
  isValidBrandColorFormat,
} from '../lib/organizationBrand';
import type { OrganizationOutletContext } from './OrganizationLayout';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import Field from '../components/Field';
import Button from '../components/Button';

const FALLBACK_PRICE_UNIT = 'por pessoa';
const FALLBACK_BRAND_COLOR = FALLBACK_PALETTE['--agency-600'];

// Comparado com Configurações do painel OVERTRIP (WhatsApp do site, padrões
// de apresentação de novas viagens, FAQ do site, base da IA): só a unidade
// de preço padrão tem paridade real e segura por empresa hoje.
//
// WhatsApp, FAQ e base da IA são configurações da OVERTRIP como plataforma
// (uma linha só no banco, sem organizationId, usada pelo site inteiro) —
// nunca de uma empresa, então não aparecem aqui nem em rota alguma do
// painel de empresa.
//
// Texto e estilo do botão ("buttonLabel"/"buttonClass") só importam quando
// uma viagem é publicada no site da OVERTRIP, o que a rota de viagens por
// empresa nunca faz (ver comentário em organizationTripRoutes.ts) — por
// isso ficam fora, para não presentear um controle sem efeito nenhum.
// Sem substituição salva (null), o valor que de fato vale ao criar uma
// viagem é o padrão fixo — o campo precisa mostrar isso, não vazio, senão
// parece que não há valor nenhum aplicado.
const effectivePriceUnit = (value: string | null) => value ?? FALLBACK_PRICE_UNIT;
// Mesma convenção do preço: sem cor própria salva (null), o painel desta
// empresa já usa a paleta verde fixa — o seletor precisa mostrar essa cor,
// não um campo vazio ou preto, senão parece que não há identidade nenhuma.
const effectiveBrandColor = (value: string | null) => value ?? FALLBACK_BRAND_COLOR;

export default function OrganizationSettings() {
  const { organization, role, updateOrganization } = useOutletContext<OrganizationOutletContext>();
  const allowed = role === 'OWNER' || role === 'ADMIN';
  const { toast } = useToast();
  const [priceUnit, setPriceUnit] = useState(effectivePriceUnit(organization.defaultPriceUnit));
  const [brandColor, setBrandColor] = useState(effectiveBrandColor(organization.brandColor));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [brandError, setBrandError] = useState('');
  const [brandSaving, setBrandSaving] = useState(false);

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Configurações" />
        <EmptyState icon={<ShieldAlert />} title="Acesso restrito" text="Somente proprietários e administradores desta empresa podem consultar as configurações." />
      </div>
    );
  }

  const persist = async (value: string | null, successMessage: string) => {
    setError('');
    setSaving(true);
    try {
      // brandColor de fora: não vai no corpo, então o servidor não toca a
      // cor já salva (omitido é diferente de null em updateSettingsSchema).
      const result = await organizationApi.updateSettings(organization.id, { defaultPriceUnit: value });
      updateOrganization(result.organization);
      setPriceUnit(effectivePriceUnit(result.organization.defaultPriceUnit));
      toast.success(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = priceUnit.trim();
    if (!trimmed) { setError('Informe a unidade de preço ou use "Restaurar o padrão".'); return; }
    // Salvar o próprio padrão não é uma substituição: grava null, igual ao
    // botão "Restaurar", para nunca duplicar o padrão fixo como se fosse
    // uma escolha desta empresa.
    await persist(trimmed === FALLBACK_PRICE_UNIT ? null : trimmed, 'Configurações salvas. Viagens já criadas não mudam.');
  };

  const restoreDefault = () => persist(null, `Restaurado para "${FALLBACK_PRICE_UNIT}".`);

  // Formulário próprio: defaultPriceUnit fica de fora do corpo (mesma
  // convenção do brandColor na outra chamada), então o servidor não toca o
  // padrão já salvo. Isso evita dois problemas com a mesma causa: gravar,
  // por acidente, uma unidade de preço ainda não confirmada pelo botão
  // "Salvar configurações" do outro formulário, e — o que já chegou a
  // acontecer aqui — reenviar um retrato antigo de organization.defaultPriceUnit
  // capturado no render, sobrescrevendo em silêncio uma mudança que outro
  // administrador tenha salvo entre o carregamento da página e este clique.
  const persistBrandColor = async (value: string | null, successMessage: string) => {
    setBrandError('');
    setBrandSaving(true);
    try {
      const result = await organizationApi.updateSettings(organization.id, { brandColor: value });
      updateOrganization(result.organization);
      setBrandColor(effectiveBrandColor(result.organization.brandColor));
      toast.success(successMessage);
    } catch (err) {
      setBrandError(err instanceof Error ? err.message : 'Não foi possível salvar a cor da empresa.');
    } finally {
      setBrandSaving(false);
    }
  };

  const saveBrandColor = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = brandColor.trim().toLowerCase();
    if (!isValidBrandColorFormat(normalized)) { setBrandError(BRAND_COLOR_FORMAT_MESSAGE); return; }
    if (!hasEnoughContrastOnWhite(normalized)) { setBrandError(BRAND_COLOR_CONTRAST_MESSAGE); return; }
    // Igual à unidade de preço: a própria cor padrão salva como null, nunca
    // como uma "escolha" duplicando o que já é o padrão fixo.
    await persistBrandColor(normalized === FALLBACK_BRAND_COLOR ? null : normalized, 'Cor da empresa salva.');
  };

  const restoreBrandColor = () => persistBrandColor(null, 'Restaurado para a cor padrão (verde).');
  const brandPreview = isValidBrandColorFormat(brandColor) ? derivePaletteFromBrandColor(brandColor) : null;

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Configurações" description="Padrões usados ao criar uma nova viagem nesta empresa." />
      <form className="card p-5 sm:p-6 space-y-5" onSubmit={save} noValidate>
        <div className="flex gap-3">
          <span className="w-10 h-10 rounded-xl bg-primary-100 text-primary-500 flex items-center justify-center shrink-0">
            <Tag className="w-5 h-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-surface-900">Unidade de preço padrão</h2>
            <p className="text-sm text-surface-600 mt-1">Preenche o campo "Unidade do preço" ao abrir "Nova viagem". Viagens já criadas mantêm o valor que já têm.</p>
          </div>
        </div>
        <Field id="org-settings-price-unit" label="Unidade do preço" hint='Exemplo: "por pessoa", "por grupo", "por diária".'>
          <input id="org-settings-price-unit" className="input max-w-md" value={priceUnit} onChange={(event) => setPriceUnit(event.target.value)} maxLength={40} disabled={saving} />
        </Field>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="primary" loading={saving}>Salvar configurações</Button>
          <Button type="button" disabled={saving || priceUnit.trim() === FALLBACK_PRICE_UNIT} onClick={() => void restoreDefault()}>Restaurar o padrão ("{FALLBACK_PRICE_UNIT}")</Button>
        </div>
      </form>
      <form className="card p-5 sm:p-6 space-y-5" onSubmit={saveBrandColor} noValidate>
        <div className="flex gap-3">
          <span className="w-10 h-10 rounded-xl bg-primary-100 text-primary-500 flex items-center justify-center shrink-0">
            <Palette className="w-5 h-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-surface-900">Identidade visual</h2>
            <p className="text-sm text-surface-600 mt-1">Cor usada em botões e destaques do painel desta empresa. Sem uma cor própria, o painel usa o verde padrão.</p>
          </div>
        </div>
        <Field id="org-settings-brand-color" label="Cor da empresa" hint="Precisa ter contraste suficiente com texto branco (mínimo 4.5:1).">
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="org-settings-brand-color"
              type="color"
              className="h-10 w-16 rounded-lg border border-surface-300 cursor-pointer disabled:cursor-not-allowed"
              value={isValidBrandColorFormat(brandColor) ? brandColor : FALLBACK_BRAND_COLOR}
              onChange={(event) => setBrandColor(event.target.value)}
              disabled={brandSaving}
            />
            <span className="text-sm text-surface-700 font-mono">{brandColor}</span>
            {brandPreview && (
              <span className="flex items-center gap-2" aria-hidden="true">
                <span className="rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: brandPreview['--agency-600'] }}>Prévia</span>
                <span className="rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: brandPreview['--agency-600-hover'] }}>Ao passar o mouse</span>
              </span>
            )}
          </div>
        </Field>
        {brandError ? <p className="text-sm text-red-700" role="alert">{brandError}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="primary" loading={brandSaving}>Salvar cor</Button>
          <Button type="button" disabled={brandSaving || brandColor.toLowerCase() === FALLBACK_BRAND_COLOR} onClick={() => void restoreBrandColor()}>Restaurar a cor padrão (verde)</Button>
        </div>
      </form>
      <p className="text-sm text-surface-600">
        As demais Configurações do painel OVERTRIP (WhatsApp, padrões de botão para publicação no site, FAQ do site e base da assistente de IA) são da plataforma, não desta empresa, e por isso não aparecem aqui.
      </p>
    </div>
  );
}
