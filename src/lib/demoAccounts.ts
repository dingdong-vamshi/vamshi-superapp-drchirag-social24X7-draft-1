export const seededDemoIdentities = [
  {
    id: 'demo-9000000001-naveentest',
    email: 'naveentest@social24x7.demo',
    phone: '9000000001',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'demo', createdBy: 'local' },
    user_metadata: {
      name: 'Naveen Kumar',
      preferred_username: 'naveentest',
    },
    created_at: '2026-07-23T00:00:00.000Z',
    updated_at: '2026-07-23T00:00:00.000Z',
  },
  {
    id: 'demo-9000000002-yogeshtest',
    email: 'yogeshtest@social24x7.demo',
    phone: '9000000002',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'demo', createdBy: 'local' },
    user_metadata: {
      name: 'Yogesh Kumar',
      preferred_username: 'yogeshtest',
    },
    created_at: '2026-07-23T00:00:00.000Z',
    updated_at: '2026-07-23T00:00:00.000Z',
  },
] as const;

export const seededDemoMessageRequests = [
  {
    requesterId: 'demo-9000000001-naveentest',
    recipientId: 'demo-9000000002-yogeshtest',
    note: 'Hi Yogesh Kumar, I would like to message you on Social 24x7.',
    status: 'pending',
    createdAt: '2026-07-26T00:00:00.000Z',
  },
] as const;
