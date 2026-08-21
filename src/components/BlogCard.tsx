import { NavLink } from "react-router";

export default function BlogCard({
  post,
}: {
  post: {
    _id: string;
    slug: {
      current: string;
    };
    title: string;
    previewBody: string;
    image: string;
  };
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-md">
      <div className="p-6">
        <h2 className="mb-2 text-xl font-semibold">
          <NavLink
            to={`/blog/${post.slug.current}`}
            className="text-blue-600 hover:text-blue-800"
          >
            {post.title}
          </NavLink>
        </h2>
        <p className="mb-4 text-muted-foreground">{post.previewBody}</p>
      </div>
    </div>
  );
}
