import {turnstilePublicConfig} from '../../../../lib/turnstile';

export async function GET(){return Response.json(turnstilePublicConfig(),{headers:{'Cache-Control':'no-store'}})}
