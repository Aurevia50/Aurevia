import {describe,expect,it} from 'vitest';
import {normalizeWaitlistEmail,waitlistSubmissionSchema} from '@/lib/waitlist';

describe('waitlist submission validation',()=>{
  it('normalizes email addresses server-side',()=>{
    expect(normalizeWaitlistEmail('  User@Example.COM  ')).toBe('user@example.com');
  });

  it('accepts a complete valid submission',()=>{
    const result=waitlistSubmissionSchema.safeParse({
      name:'Ada Lovelace',
      email:'  ADA@EXAMPLE.COM ',
      country:'GB',
      investorType:'INDIVIDUAL',
      phone:'+44 20 7946 0958',
      consent:true,
      source:'website',
    });
    expect(result.success).toBe(true);
    if(result.success)expect(result.data.email).toBe('ada@example.com');
  });

  it('rejects invalid email, required fields, and missing consent',()=>{
    const invalid=waitlistSubmissionSchema.safeParse({name:'',email:'not-an-email',country:'',investorType:'',consent:false});
    expect(invalid.success).toBe(false);
  });

  it('accepts an omitted optional phone',()=>{
    const result=waitlistSubmissionSchema.safeParse({name:'Ada Lovelace',email:'ada@example.com',country:'GB',investorType:'INDIVIDUAL',consent:true});
    expect(result.success).toBe(true);
    if(result.success)expect(result.data.phone).toBeUndefined();
  });
});
