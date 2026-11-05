'use client';

import {
  AI_CONTENT_KINDS,
  AI_MESSAGE_KINDS,
  AI_TONES,
  type AiGenerateInput,
  type AiGenerateResult,
} from '@mawid/shared';
import { useMutation } from '@tanstack/react-query';
import { Copy, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/mawid/spinner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

type Kind = AiGenerateInput['kind'];
type Locale = AiGenerateInput['locale'];
type Tone = (typeof AI_TONES)[number];

export const MESSAGE_KINDS: readonly Kind[] = AI_MESSAGE_KINDS;
export const BUSINESS_KINDS: readonly Kind[] = [AI_CONTENT_KINDS[0]];
export const SERVICE_KINDS: readonly Kind[] = [AI_CONTENT_KINDS[1]];

/**
 * "Write with AI": the owner picks what to write, language and tone, reads and edits the preview,
 * then chooses to use it. The AI never saves or sends anything by itself (AI-03, AI-05).
 */
export function AiWriteDialog({
  kinds,
  defaultLocale,
  serviceId,
  seed,
  onUse,
}: {
  kinds: readonly Kind[];
  defaultLocale: Locale;
  serviceId?: string;
  /** Prefilled idea (for example the service name). */
  seed?: string;
  /** Called with the edited text when the owner clicks "Use this text". Without it, only Copy is offered. */
  onUse?: (text: string) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(kinds[0]);
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [tone, setTone] = useState<Tone>('friendly');
  const [idea, setIdea] = useState(seed ?? '');
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();

  const generate = useMutation({
    mutationFn: (body: AiGenerateInput) =>
      api<AiGenerateResult>('/ai/generate', { method: 'POST', body }),
    onSuccess: (r) => setText(r.text),
    onError: (e) => setError(errorMessage(t, e)),
  });
  const ideaNeeded =
    kind === 'business_description' || (kind === 'service_description' && !serviceId);

  function run() {
    setError(undefined);
    if (ideaNeeded && idea.trim().length < 3) {
      setError(t('form.errors.required'));
      return;
    }
    generate.mutate({
      kind,
      locale,
      tone,
      keywords: idea.trim() || null,
      ...(kind === 'service_description' && serviceId ? { serviceId } : {}),
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          setIdea((i) => i || seed || '');
          setOpen(true);
        }}
      >
        <Sparkles aria-hidden className="size-4 text-primary" />
        {t('aiWrite.button')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('aiWrite.title')}</DialogTitle>
            <DialogDescription>{t('aiWrite.desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {kinds.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="aw-kind">{t('aiWrite.kind')}</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                  <SelectTrigger id="aw-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {kinds.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`aiWrite.kinds.${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="aw-lang">{t('aiWrite.language')}</Label>
                <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                  <SelectTrigger id="aw-lang">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['ar', 'fr', 'en'] as const).map((l) => (
                      <SelectItem key={l} value={l}>
                        {t(`settings.locales.${l}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aw-tone">{t('aiWrite.tone')}</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                  <SelectTrigger id="aw-tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_TONES.map((x) => (
                      <SelectItem key={x} value={x}>
                        {t(`aiWrite.tones.${x}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aw-idea">
                {ideaNeeded ? t('aiWrite.idea') : t('aiWrite.ideaOptional')}
              </Label>
              <Input
                id="aw-idea"
                value={idea}
                maxLength={300}
                placeholder={t(
                  kind === 'promotion' ? 'aiWrite.ideaPromo' : 'aiWrite.ideaPlaceholder',
                )}
                onChange={(e) => setIdea(e.target.value)}
              />
            </div>
            <Button
              type="button"
              className="w-full gap-2"
              disabled={generate.isPending}
              onClick={run}
            >
              {generate.isPending ? <Spinner /> : <Sparkles aria-hidden className="size-4" />}
              {text ? t('aiWrite.again') : t('aiWrite.generate')}
            </Button>
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {text && (
              <div className="space-y-1.5">
                <Label htmlFor="aw-text">{t('aiWrite.preview')}</Label>
                <Textarea
                  id="aw-text"
                  rows={6}
                  value={text}
                  dir={locale === 'ar' ? 'rtl' : 'ltr'}
                  onChange={(e) => setText(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('aiWrite.reviewNote')}</p>
              </div>
            )}
          </div>
          {text && (
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  void navigator.clipboard?.writeText(text);
                  toast.success(t('aiWrite.copied'));
                }}
              >
                <Copy aria-hidden className="size-4" />
                {t('aiWrite.copy')}
              </Button>
              {onUse && (
                <Button
                  type="button"
                  onClick={() => {
                    onUse(text);
                    setOpen(false);
                  }}
                >
                  {t('aiWrite.use')}
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
