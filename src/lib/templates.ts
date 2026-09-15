import type { Template, TemplateId } from './types'

export const TEMPLATES: Record<TemplateId, Template> = {
  b2b_leads: {
    id: 'b2b_leads',
    label: 'Leads B2B',
    description: 'Contacts commerciaux, recruteurs, agences',
    fields: ['company_name', 'contact_name', 'email', 'phone', 'job_title', 'summary'],
    headers: {
      company_name: 'Entreprise',
      contact_name: 'Contact',
      email: 'Email',
      phone: 'Téléphone',
      job_title: 'Poste',
      summary: 'Résumé',
    },
  },
  directory: {
    id: 'directory',
    label: 'Annuaire',
    description: 'Fiches entreprises et listings',
    fields: ['company_name', 'website', 'email', 'phone', 'address', 'industry', 'summary'],
    headers: {
      company_name: 'Entreprise',
      website: 'Site web',
      email: 'Email',
      phone: 'Téléphone',
      address: 'Adresse',
      industry: 'Secteur',
      summary: 'Résumé',
    },
  },
  real_estate: {
    id: 'real_estate',
    label: 'Immobilier',
    description: 'Annonces, agences, mandats',
    fields: [
      'title',
      'price',
      'location',
      'surface',
      'rooms',
      'contact_name',
      'phone',
      'email',
      'summary',
    ],
    headers: {
      title: 'Bien',
      price: 'Prix',
      location: 'Localisation',
      surface: 'Surface',
      rooms: 'Pièces',
      contact_name: 'Contact',
      phone: 'Téléphone',
      email: 'Email',
      summary: 'Résumé',
    },
  },
  jobs: {
    id: 'jobs',
    label: 'Emploi',
    description: 'Offres et fiches de poste',
    fields: [
      'company_name',
      'job_title',
      'location',
      'contract_type',
      'salary',
      'contact_name',
      'email',
      'summary',
    ],
    headers: {
      company_name: 'Entreprise',
      job_title: 'Poste',
      location: 'Lieu',
      contract_type: 'Contrat',
      salary: 'Salaire',
      contact_name: 'Contact',
      email: 'Email',
      summary: 'Résumé',
    },
  },
}

export const TEMPLATE_LIST = Object.values(TEMPLATES)

export function getTemplate(id: string | undefined): Template {
  if (id && id in TEMPLATES) return TEMPLATES[id as TemplateId]
  return TEMPLATES.b2b_leads
}
