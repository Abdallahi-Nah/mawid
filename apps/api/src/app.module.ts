import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './auth/guards';
import { BookingsModule } from './bookings/bookings.module';
import { BusinessesModule } from './businesses/businesses.module';
import { CustomersModule } from './customers/customers.module';
import { EnvModule } from './config/env.module';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublicModule } from './public/public.module';
import { ServicesModule } from './services/services.module';
import { StaffModule } from './staff/staff.module';
import { StorageModule } from './storage/storage.module';
import { TimeOffModule } from './time-off/time-off.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          process.env.NODE_ENV === 'production'
            ? 'info'
            : process.env.NODE_ENV === 'test'
              ? 'silent'
              : 'debug',
        transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
        redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      },
    }),
    // Default limit for all routes. Login, register and password routes have a stricter one.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      skipIf: () => process.env.THROTTLE_DISABLED === 'true',
    }),
    EnvModule,
    PrismaModule,
    MailModule,
    JwtModule.register({}),
    StorageModule,
    AuthModule,
    BusinessesModule,
    NotificationsModule,
    BookingsModule,
    CustomersModule,
    ServicesModule,
    StaffModule,
    TimeOffModule,
    PublicModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit, then login, then role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
