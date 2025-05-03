import bcrypt from 'bcrypt';
import postgres from 'postgres';
import { invoices, customers, revenue, users } from '../lib/placeholder-data';

const sql = postgres(process.env.POSTGRES_URL!, { 
  ssl: 'require',
  connect_timeout: 30,
  idle_timeout: 30,
  max_lifetime: 60 * 30,
  max: 10,
  connection: {
    application_name: 'nextjs-Orkun',
    statement_timeout: 60000,
    query_timeout: 60000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
  },
  onnotice: () => {},
  onparameter: () => {},
  debug: (connection, query, parameters) => {
    console.log('Query:', query);
    console.log('Parameters:', parameters);
  },
  transform: {
    undefined: null,
  },
  prepare: false,
});

async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  throw lastError;
}

async function seedUsers() {
  return withRetry(async () => {
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );
    `;

    const insertedUsers = await Promise.all(
      users.map(async (user) => {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        return sql`
          INSERT INTO users (id, name, email, password)
          VALUES (${user.id}, ${user.name}, ${user.email}, ${hashedPassword})
          ON CONFLICT (id) DO NOTHING;
        `;
      }),
    );

    return insertedUsers;
  });
}

async function seedInvoices() {
  return withRetry(async () => {
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

    await sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        customer_id UUID NOT NULL,
        amount INT NOT NULL,
        status VARCHAR(255) NOT NULL,
        date DATE NOT NULL
      );
    `;

    const insertedInvoices = await Promise.all(
      invoices.map(
        (invoice) => sql`
          INSERT INTO invoices (customer_id, amount, status, date)
          VALUES (${invoice.customer_id}, ${invoice.amount}, ${invoice.status}, ${invoice.date})
          ON CONFLICT (id) DO NOTHING;
        `,
      ),
    );

    return insertedInvoices;
  });
}

async function seedCustomers() {
  return withRetry(async () => {
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

    await sql`
      CREATE TABLE IF NOT EXISTS customers (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        image_url VARCHAR(255) NOT NULL
      );
    `;

    const insertedCustomers = await Promise.all(
      customers.map(
        (customer) => sql`
          INSERT INTO customers (id, name, email, image_url)
          VALUES (${customer.id}, ${customer.name}, ${customer.email}, ${customer.image_url})
          ON CONFLICT (id) DO NOTHING;
        `,
      ),
    );

    return insertedCustomers;
  });
}

async function seedRevenue() {
  return withRetry(async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS revenue (
        month VARCHAR(4) NOT NULL UNIQUE,
        revenue INT NOT NULL
      );
    `;

    const insertedRevenue = await Promise.all(
      revenue.map(
        (rev) => sql`
          INSERT INTO revenue (month, revenue)
          VALUES (${rev.month}, ${rev.revenue})
          ON CONFLICT (month) DO NOTHING;
        `,
      ),
    );

    return insertedRevenue;
  });
}

export async function GET() {
  try {
    const result = await withRetry(async () => {
      return await sql.begin(async (sql) => {
        try {
          await seedUsers();
          await seedCustomers();
          await seedInvoices();
          await seedRevenue();
          return { success: true };
        } catch (error) {
          console.error('Error during seeding:', error);
          throw error;
        }
      });
    });

    return Response.json({ message: 'Database seeded successfully' });
  } catch (error) {
    console.error('Database seeding failed:', error);
    return Response.json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      details: error
    }, { status: 500 });
  }
}