import {env} from 'cloudflare:workers';
import {healthCheckResponse} from '../../lib/health-check.mjs';

export async function GET(){return healthCheckResponse(env.DB);}
