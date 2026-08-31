// src/mock/faker.mjs
// Zero-Dependency Synthetic Data Generator (replaces @faker-js/faker).
// Uses node:crypto for high entropy and deterministic seed capability.

import { randomBytes, randomInt, randomUUID } from 'node:crypto';

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Sam', 'Chris', 'Casey', 'Riley',
  'Elena', 'Marcus', 'Sophia', 'Liam', 'Maya', 'Lucas', 'Aria', 'Noah',
  'Olivia', 'Ethan', 'Chloe', 'Zane', 'Harper', 'Leo', 'Mia', 'Gabriel'
];

const LAST_NAMES = [
  'Vance', 'Sterling', 'Holloway', 'Mercer', 'Chen', 'Patel', 'Kowalski',
  'O\'Connor', 'Novak', 'Sinclair', 'Ashford', 'Morales', 'Tanaka', 'Dubois',
  'Lindqvist', 'Reyes', 'Kim', 'Bauer', 'Nakamura', 'Fontaine', 'Blackwood'
];

const COMPANIES = [
  'Apex Systems', 'Vanguard Logic', 'CloudScale Technologies', 'Aether Dynamics',
  'Quantum Leap Analytics', 'Prism Security', 'Hyperion Data Labs', 'Synthetix AI',
  'OmniFlow Systems', 'BlueShift Networks', 'Orbit Velocity', 'Stratum Cloud'
];

const DEPARTMENTS = [
  'Engineering', 'Infrastructure', 'Product Design', 'DevOps & SRE',
  'Security & Compliance', 'Data Science', 'Developer Relations', 'QA Automation'
];

const JOB_TITLES = [
  'Principal Systems Architect', 'Senior Backend Engineer', 'Staff SRE',
  'Lead Security Analyst', 'Product Engineering Lead', 'Core Platform Engineer'
];

const CITIES = [
  'San Francisco', 'Berlin', 'Tokyo', 'London', 'Toronto', 'Singapore',
  'Stockholm', 'Amsterdam', 'Austin', 'Zurich', 'Sydney', 'Seoul'
];

const COUNTRIES = [
  'United States', 'Germany', 'Japan', 'United Kingdom', 'Canada', 'Singapore',
  'Sweden', 'Netherlands', 'Switzerland', 'Australia', 'South Korea', 'France'
];

const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'curabitur', 'vel', 'magna', 'feugiat', 'efficitur', 'tortor', 'quis', 'tempus',
  'lacus', 'nulla', 'facilisi', 'vestibulum', 'sagittis', 'euismod', 'viverra',
  'interdum', 'faucibus', 'ornare', 'placerat', 'consequat', 'scelerisque', 'semper'
];

export class ZeroFaker {
  constructor(seed = null) {
    this.seed = seed;
  }

  choice(arr) {
    if (!arr || arr.length === 0) return null;
    const idx = randomInt(0, arr.length);
    return arr[idx];
  }

  firstName() { return this.choice(FIRST_NAMES); }
  lastName() { return this.choice(LAST_NAMES); }
  name() { return `${this.firstName()} ${this.lastName()}`; }

  username(name = null) {
    const base = name ? name.toLowerCase().replace(/[^a-z0-9]/g, '.') : `${this.firstName().toLowerCase()}.${this.lastName().toLowerCase()}`;
    return `${base}.${randomInt(10, 999)}`;
  }

  email(name = null) {
    const user = this.username(name);
    const domain = this.choice(['example.dev', 'acme.io', 'hyperion.org', 'cloudops.net']);
    return `${user}@${domain}`;
  }

  company() { return this.choice(COMPANIES); }
  department() { return this.choice(DEPARTMENTS); }
  jobTitle() { return this.choice(JOB_TITLES); }

  city() { return this.choice(CITIES); }
  country() { return this.choice(COUNTRIES); }
  street() { return `${randomInt(100, 9999)} ${this.choice(['Market St', 'Broadway', 'Mission Ave', 'Silicon Way', 'Pine Blvd', 'Tech Parkway'])}`; }
  zipCode() { return `${randomInt(10000, 99999)}`; }

  uuid() { return randomUUID(); }

  int(min = 0, max = 100) {
    if (min >= max) return min;
    return randomInt(min, max + 1);
  }

  float(min = 0, max = 100, precision = 2) {
    const factor = Math.pow(10, precision);
    const val = min + (Math.random() * (max - min));
    return Math.round(val * factor) / factor;
  }

  boolean(probability = 0.5) {
    return Math.random() < probability;
  }

  isoDate(fromDaysAgo = 30, toDaysAgo = 0) {
    const now = Date.now();
    const minTime = now - (fromDaysAgo * 86400000);
    const maxTime = now - (toDaysAgo * 86400000);
    const randomTime = minTime + Math.random() * (maxTime - minTime);
    return new Date(randomTime).toISOString();
  }

  price(min = 10, max = 1000, currency = 'USD') {
    return {
      amount: this.float(min, max, 2),
      currency
    };
  }

  lorem(wordsCount = 10) {
    const words = [];
    for (let i = 0; i < wordsCount; i++) {
      words.push(this.choice(LOREM_WORDS));
    }
    const str = words.join(' ');
    return str.charAt(0).toUpperCase() + str.slice(1) + '.';
  }

  avatar(id = null) {
    const safeId = id || this.uuid();
    return `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`;
  }
}

export const faker = new ZeroFaker();
