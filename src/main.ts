import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS
  app.enableCors({
    origin: [process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173', 'https://mymquid.com'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global class serializer (for @Exclude() on password)
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('MyMquid Elevate API')
    .setDescription('Admin backend for MyMquid Elevate platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application running on: http://localhost:${process.env.PORT ?? 3000}/api/v1`);
  console.log(`Swagger docs: http://localhost:${process.env.PORT ?? 3000}/api/docs`);
}

bootstrap();
