'use client';

import { forwardRef, type AnchorHTMLAttributes } from 'react';

type NativeLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

const NativeLink = forwardRef<HTMLAnchorElement, NativeLinkProps>(function NativeLink(
  { href, ...props },
  ref,
) {
  return <a href={href} ref={ref} {...props} />;
});

NativeLink.displayName = 'NativeLink';

export default NativeLink;
