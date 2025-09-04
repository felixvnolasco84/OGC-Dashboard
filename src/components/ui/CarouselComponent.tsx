import {
  Carousel,
  CarouselContent,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

export default function CarouselComponent({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Carousel className="w-full min-w-0 lg:px-8">
      <CarouselContent>{children}</CarouselContent>
      <div className="flex justify-between">
        <CarouselPrevious className="left-0 z-10 text-[#6D6D6D] lg:hidden" />
        <CarouselNext className="right-0 z-10 text-[#6D6D6D] lg:hidden" />
      </div>
    </Carousel>
  );
}
