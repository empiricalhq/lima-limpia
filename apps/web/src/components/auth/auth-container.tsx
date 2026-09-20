import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface AuthContainerProps extends React.ComponentProps<'div'> {
  children: React.ReactNode;
  showBrandImage?: boolean;
  footer?: React.ReactNode;
}

export function AuthContainer({ children, showBrandImage = false, footer, className, ...props }: AuthContainerProps) {
  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="overflow-hidden">
        <CardContent className={cn('grid p-0 md:min-h-[500px]', showBrandImage && 'md:grid-cols-2')}>
          <div className="p-6 md:p-8 flex items-center">
            <div className="w-full">{children}</div>
          </div>

          {showBrandImage ? (
            <div className="relative bg-muted hidden md:flex items-center justify-center overflow-hidden -my-8">
              <Image
                src="/lima-verde.webp"
                alt="Lima Limpia"
                fill={true}
                className="object-cover dark:brightness-[0.8]"
                priority={true}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {footer ? <div>{footer}</div> : null}
    </div>
  );
}
