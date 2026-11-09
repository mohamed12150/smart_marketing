// الإعدادات › قاعدة المعرفة: the only facts (besides the brand brief) agents may state to customers.
// A question these do not answer is never guessed: the agent says it will check, and escalates to the owner.
import { html, useMemo } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { can } from '../../lib/store.js';
import { num } from '../../lib/format.js';
import { Icon, Button, Card, Skeleton, Loader } from '../../ui/core.js';
import { useCachedApi, useForm, check, withSection, SettingsForm, Head, ReadOnly, TextField } from './kit.js';

const MAX_FAQS = 80;
const MAX_POLICIES = 24;
const EMPTY_FAQ = { question: '', answer: '' };
const EMPTY_POLICY = { title: '', text: '' };
const POLICY_HINTS = ['سياسة الشحن والتوصيل', 'الاسترجاع والاستبدال', 'ساعات العمل', 'طرق الدفع', 'الضمان'];

function validate(d) {
  const errors = {};
  d.faqs.forEach((q, i) => {
    if (!q.question.trim() && q.answer.trim()) errors[`faqs.${i}.question`] = 'اكتب السؤال';
    if (q.question.trim() && !q.answer.trim()) errors[`faqs.${i}.answer`] = 'اكتب الإجابة المعتمدة';
  });
  d.policies.forEach((p, i) => {
    if (!p.title.trim() && p.text.trim()) errors[`policies.${i}.title`] = 'اكتب عنوان السياسة';
  });
  return errors;
}

/** Trim everything and drop incomplete rows; a new object, the draft is untouched. */
function clean(d) {
  return {
    faqs: d.faqs.filter((q) => q.question.trim() && q.answer.trim())
      .map((q) => ({ question: q.question.trim(), answer: q.answer.trim() })),
    policies: d.policies.filter((p) => p.title.trim())
      .map((p) => ({ title: p.title.trim(), text: p.text.trim() })),
    notes: d.notes.trim(),
  };
}

function Grounding() {
  return html`<div class="card pad st-brief">
    <span class="mark lg agent"><${Icon} name="book" size="22" /></span>
    <div class="grow"><b>الوكلاء يجيبون من هنا فقط — بلا تخمين</b>
      <p class="small muted">كل ما تكتبه هنا يعامله صانع المحتوى كحقيقة معتمدة يجيب بها العملاء مباشرة.
        وأي سؤال لا تغطيه هذه القاعدة ولا ملف العلامة، لا يخترع الوكيل إجابته: يعتذر بلطف، يَعِد العميل بالتأكد،
        ويحوّل المحادثة إليك. كلما أضفت أكثر، ردّ الوكيل بنفسه أكثر واحتاجك أقل.</p></div>
  </div>`;
}

function Rows({ items, max, empty, onChange, render, addLabel }) {
  const update = (i, key, value) => onChange(items.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  const add = () => onChange([...items, empty]);
  return html`
    ${items.length ? html`<div class="st-prods">${items.map((r, i) => html`<div class="st-prod" key=${i}>
        <span class="st-prod-n num">${num(i + 1)}</span>
        <div class="st-prod-fields">${render(r, i, update)}</div>
        <${Button} variant="ghost" size="sm" icon="trash" class="st-prod-x" aria-label=${`حذف السطر ${i + 1}`} title="حذف"
          onClick=${() => remove(i)} />
      </div>`)}</div>` : ''}
    <div class="row between wrap mt-12">
      <${Button} size="sm" icon="plus" onClick=${add} disabled=${items.length >= max}>${addLabel}</${Button}>
      <span class="tiny faint">${num(items.length)} من ${num(max)}</span>
    </div>`;
}

function KnowledgeForm({ initial, onSaved }) {
  const f = useForm(initial);
  const d = f.draft;
  const editable = can('settings');
  const submit = () => {
    if (!check(f, validate(d))) return;
    f.save(async () => {
      const obj = await api.put('/settings/knowledge', clean(d));
      onSaved(obj);
      return obj;
    }, 'حُفظت قاعدة المعرفة، وسيجيب منها الوكلاء من الرد القادم');
  };
  const setList = (key) => (items) => {
    f.set(key, items);
    f.setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(key))));
  };
  return html`<${Grounding} />
    <${SettingsForm} form=${f} onSubmit=${submit} canEdit=${editable} saveLabel="حفظ قاعدة المعرفة">
      <${Card} title="السياسات" icon="shield"
        actions=${html`<span class="tiny faint">مثل: ${POLICY_HINTS.join('، ')}</span>`}>
        ${!d.policies.length && html`<p class="muted small">سياساتك المعتمدة: شحن، استرجاع، ساعات عمل، دفع…
          يذكرها الوكيل حرفيًا عند السؤال عنها.</p>`}
        <${Rows} items=${d.policies} max=${MAX_POLICIES} empty=${EMPTY_POLICY} onChange=${setList('policies')}
          addLabel="إضافة سياسة"
          render=${(p, i, update) => html`
            <${TextField} label="العنوان" value=${p.title} maxLength=${120} error=${f.errors[`policies.${i}.title`]}
              onInput=${(e) => update(i, 'title', e.currentTarget.value)} placeholder="مثل: سياسة الشحن" />
            <${TextField} class="st-prod-desc" area rows=${2} label="النص المعتمد" value=${p.text} maxLength=${1500}
              error=${f.errors[`policies.${i}.text`]} onInput=${(e) => update(i, 'text', e.currentTarget.value)}
              placeholder="مثل: التوصيل داخل الرياض خلال 24 ساعة، ومجاني للطلبات فوق 200 ريال" />`} />
      </${Card}>

      <${Card} title="الأسئلة الشائعة" icon="message">
        ${!d.faqs.length && html`<p class="muted small">أكثر ما يسأله عملاؤك، بإجابتك المعتمدة.
          كل سؤال تضيفه هنا يرد عليه الوكيل فورًا بدل تحويل العميل إليك.</p>`}
        <${Rows} items=${d.faqs} max=${MAX_FAQS} empty=${EMPTY_FAQ} onChange=${setList('faqs')}
          addLabel="إضافة سؤال وجواب"
          render=${(q, i, update) => html`
            <${TextField} class="st-prod-desc" label="السؤال" value=${q.question} maxLength=${300}
              error=${f.errors[`faqs.${i}.question`]} onInput=${(e) => update(i, 'question', e.currentTarget.value)}
              placeholder="مثل: هل يوجد توصيل لجدة؟" />
            <${TextField} class="st-prod-desc" area rows=${2} label="الإجابة المعتمدة" value=${q.answer} maxLength=${1200}
              error=${f.errors[`faqs.${i}.answer`]} onInput=${(e) => update(i, 'answer', e.currentTarget.value)}
              placeholder="مثل: نعم، التوصيل لجدة خلال يومين عمل برسوم 25 ريالًا" />`} />
      </${Card}>

      <${Card} title="معلومات إضافية" icon="book">
        <${TextField} area rows=${5} counter label="أي حقائق أخرى معتمدة" maxLength=${3000} ...${f.bind('notes')}
          error=${f.errors.notes}
          help="فروعك وعناوينها، مواعيد مواسم، تفاصيل خدمة… كل سطر هنا يصبح معلومة يحق للوكيل ذكرها." />
      </${Card}>
    </${SettingsForm}>`;
}

function KnowledgeSkeleton() {
  return html`<div class="col gap-16">${[96, 220, 260, 160].map((h) => html`<div class="card pad"><${Skeleton} h=${h} /></div>`)}</div>`;
}

export default function KnowledgeTab() {
  const st = useCachedApi('/settings');
  const initial = useMemo(() => st.data?.sections?.knowledge, [st.data]);
  const onSaved = (obj) => st.setData(withSection('knowledge', obj));
  return html`<${Head} title="قاعدة المعرفة" text="الحقائق المعتمدة التي يجيب بها الوكلاء عملاءك: سياسات، أسئلة شائعة، ومعلومات شركتك." />
    ${!can('settings') && html`<${ReadOnly} cap="settings" />`}
    <${Loader} state=${st} skeleton=${html`<${KnowledgeSkeleton} />`}>${() => html`<${KnowledgeForm} initial=${initial} onSaved=${onSaved} />`}</${Loader}>`;
}
